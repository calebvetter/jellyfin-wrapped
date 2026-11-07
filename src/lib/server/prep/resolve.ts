/**
 * Metadata resolution for every item that appears in playback history.
 *
 * Resolution order per Jellyfin item id:
 *   1. Jellyfin /Items (fresh, authoritative while the item still exists)
 *   2. persistent media_cache entry from an earlier preparation (item since deleted)
 *   3. Jellystat getItemDetails (Jellystat archives deleted items: name/year/genres/runtime)
 *   4. names recorded on the playback rows themselves
 * TMDb identity (for popularity, cast, artwork of deleted items) comes from:
 *   Jellyfin ProviderIds.Tmdb -> Seerr request media (jellyfinMediaId) -> Seerr imdb:/tvdb:
 *   lookup -> Seerr title+year search. TMDb details are fetched via Seerr and cached.
 * Everything resolved is written back to media_cache so history never loses its titles.
 */
import { all, run } from '../db';
import * as jf from '../integrations/jellyfin';
import * as js from '../integrations/jellystat';
import * as seerr from '../integrations/seerr';
import { mapLimit } from '../integrations/http';
import { seerrEnabled } from '../config';
import type { ArtSource } from '../artwork';
import type { CastMember, ItemMeta, TitleMeta } from './model';
import { normalizeGenres } from './aggregate';

/** Cached, source-agnostic view of a Jellyfin item. */
export interface CachedItem {
	id: string;
	type: string; // Movie | Episode | Series | ...
	name: string;
	year: number | null;
	runtimeSec: number | null;
	seriesId: string | null;
	seriesName: string | null;
	season: number | null;
	episode: number | null;
	genres: string[];
	people: { id?: string; name: string; role?: string | null; type?: string; imageTag?: string | null }[];
	providerIds: Record<string, string>;
	primaryTag: string | null;
	backdropTag: string | null;
	tmdbId?: number | null; // resolved TMDb id (movie or tv)
	inLibrary: boolean;
	source: 'jellyfin' | 'jellystat' | 'playback';
}

export interface TmdbCached {
	id: number;
	mediaType: 'movie' | 'tv';
	title: string;
	year: number | null;
	popularity: number | null;
	posterPath: string | null;
	backdropPath: string | null;
	genres: string[];
	cast: { id: number; name: string; character: string | null; profilePath: string | null; order: number }[];
	seasons: Record<number, number> | null;
	runtimeSec: number | null;
	fetchedAt: number;
}

export interface PlaybackHint {
	itemId: string;
	kind: 'movie' | 'episode' | 'series';
	name: string | null;
	seriesName?: string | null;
	seriesId?: string | null;
}

export interface ResolveResult {
	items: Map<string, ItemMeta>; // by jellyfin id (movies + episodes)
	titles: Map<string, TitleMeta>;
	stats: {
		items: number;
		fromJellyfin: number;
		fromCache: number;
		fromJellystat: number;
		fromPlaybackOnly: number;
		tmdbResolved: number;
		titlesWithPopularity: number;
		titlesMissingFromLibrary: number;
		unresolvedTypes: number;
	};
}

const TMDB_TTL_MS = 3 * 86_400_000;

function cacheGet<T>(keys: string[]): Map<string, T> {
	const out = new Map<string, T>();
	for (let i = 0; i < keys.length; i += 500) {
		const chunk = keys.slice(i, i + 500);
		const rows = all<{ key: string; data: string }>(
			`SELECT key, data FROM media_cache WHERE key IN (${chunk.map(() => '?').join(',')})`,
			...chunk
		);
		for (const r of rows) {
			try {
				out.set(r.key, JSON.parse(r.data) as T);
			} catch {
				/* ignore corrupt entry */
			}
		}
	}
	return out;
}

function cachePut(key: string, data: unknown, source: string) {
	run(
		`INSERT INTO media_cache (key, data, source, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET data = excluded.data, source = excluded.source, updated_at = excluded.updated_at`,
		key,
		JSON.stringify(data),
		source,
		Date.now()
	);
}

function fromJellyfinItem(i: jf.JellyfinItem): CachedItem {
	return {
		id: i.Id,
		type: i.Type,
		name: i.Name,
		year: i.ProductionYear ?? (i.PremiereDate ? new Date(i.PremiereDate).getUTCFullYear() : null),
		runtimeSec: jf.ticksToSeconds(i.RunTimeTicks),
		seriesId: i.SeriesId ?? null,
		seriesName: i.SeriesName ?? null,
		season: i.ParentIndexNumber ?? null,
		episode: i.IndexNumber ?? null,
		genres: i.Genres ?? [],
		people: (i.People ?? []).map((p) => ({ id: p.Id, name: p.Name, role: p.Role ?? null, type: p.Type, imageTag: p.PrimaryImageTag ?? null })),
		providerIds: Object.fromEntries(Object.entries(i.ProviderIds ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])),
		primaryTag: i.ImageTags?.Primary ?? null,
		backdropTag: i.BackdropImageTags?.[0] ?? null,
		inLibrary: true,
		source: 'jellyfin'
	};
}

function fromJellystatItem(d: js.JellystatItemDetails, hint: PlaybackHint | undefined): CachedItem {
	const year = Number(d.ProductionYear) || (d.PremiereDate ? new Date(d.PremiereDate).getUTCFullYear() : null);
	return {
		id: d.Id,
		type: d.Type ?? (hint?.kind === 'episode' ? 'Episode' : hint?.kind === 'series' ? 'Series' : 'Movie'),
		name: d.Name,
		year: year || null,
		runtimeSec: jf.ticksToSeconds(Number(d.RunTimeTicks) || null),
		seriesId: d.SeriesId ?? hint?.seriesId ?? null,
		seriesName: d.SeriesName ?? hint?.seriesName ?? null,
		season: d.ParentIndexNumber ?? null,
		episode: d.IndexNumber ?? null,
		genres: Array.isArray(d.Genres) ? d.Genres : [],
		people: [],
		providerIds: {},
		primaryTag: null,
		backdropTag: null,
		inLibrary: false,
		source: 'jellystat'
	};
}

export function personKey(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function tmdbArt(path: string | null, size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280'): ArtSource | null {
	return path ? { key: `tmdb:${path}:${size}`, urls: seerr.tmdbImageUrls(path, size) } : null;
}

function jfArt(id: string, kind: 'Primary' | 'Backdrop', tag: string | null, width: number): ArtSource {
	return { key: `jf:${id}:${kind}:${tag ?? ''}:${width}`, urls: [jf.imageUrl(id, kind, tag, width)], headers: jf.imageHeaders() };
}

/** Fetch TMDb details through Seerr and store them in the persistent cache. */
export async function fetchTmdb(mediaType: 'movie' | 'tv', id: number): Promise<TmdbCached | null> {
	const d = mediaType === 'movie' ? await seerr.getMovie(id) : await seerr.getTv(id);
	if (!d) return null;
	const date = d.releaseDate ?? d.firstAirDate ?? null;
	const entry: TmdbCached = {
		id,
		mediaType,
		title: d.title ?? d.name ?? '',
		year: date ? Number(date.slice(0, 4)) || null : null,
		popularity: typeof d.popularity === 'number' ? d.popularity : null,
		posterPath: d.posterPath ?? null,
		backdropPath: d.backdropPath ?? null,
		genres: (d.genres ?? []).map((g) => g.name),
		cast: (d.credits?.cast ?? []).slice(0, 25).map((c, i) => ({
			id: c.id,
			name: c.name,
			character: c.character ?? null,
			profilePath: c.profilePath ?? null,
			order: c.order ?? i
		})),
		seasons: d.seasons ? Object.fromEntries(d.seasons.filter((s) => s.seasonNumber > 0).map((s) => [s.seasonNumber, s.episodeCount])) : null,
		runtimeSec: d.runtime ? d.runtime * 60 : d.episodeRunTime?.[0] ? d.episodeRunTime[0] * 60 : null,
		fetchedAt: Date.now()
	};
	cachePut(`tmdb:${mediaType}:${id}`, entry, 'seerr');
	return entry;
}

/** Cached TMDb details (fresh enough) or a new fetch; null when unavailable. */
export async function tmdbDetails(mediaType: 'movie' | 'tv', id: number): Promise<TmdbCached | null> {
	const key = `tmdb:${mediaType}:${id}`;
	const c = cacheGet<TmdbCached>([key]).get(key) ?? null;
	if (c && Date.now() - c.fetchedAt < TMDB_TTL_MS) return c;
	if (!seerrEnabled()) return c;
	try {
		return (await fetchTmdb(mediaType, id)) ?? c;
	} catch {
		return c;
	}
}

export function tmdbPoster(t: TmdbCached | null): ArtSource | null {
	return tmdbArt(t?.posterPath ?? null, 'w500');
}

export async function resolveMetadata(
	hints: PlaybackHint[],
	requestTmdb: Map<string, { tmdbId: number; type: 'movie' | 'tv' }>,
	log: (msg: string) => void,
	progress: (done: number, total: number, phase: string) => void
): Promise<ResolveResult> {
	const hintById = new Map<string, PlaybackHint>();
	for (const h of hints) if (!hintById.has(h.itemId)) hintById.set(h.itemId, h);
	const ids = [...hintById.keys()];
	const stats: ResolveResult['stats'] = {
		items: ids.length,
		fromJellyfin: 0,
		fromCache: 0,
		fromJellystat: 0,
		fromPlaybackOnly: 0,
		tmdbResolved: 0,
		titlesWithPopularity: 0,
		titlesMissingFromLibrary: 0,
		unresolvedTypes: 0
	};

	// 1) Jellyfin
	progress(0, ids.length, 'Fetching library metadata from Jellyfin');
	const fresh = new Map<string, CachedItem>();
	for (let i = 0; i < ids.length; i += 200) {
		const items = await jf.getItems(ids.slice(i, i + 200));
		for (const it of items) fresh.set(it.Id, fromJellyfinItem(it));
		progress(Math.min(ids.length, i + 200), ids.length, 'Fetching library metadata from Jellyfin');
	}
	const cached = cacheGet<CachedItem>(ids.map((id) => `jf:${id}`));
	const items = new Map<string, CachedItem>();
	for (const id of ids) {
		const f = fresh.get(id);
		const c = cached.get(`jf:${id}`);
		if (f) {
			if (c?.tmdbId && !f.providerIds.tmdb) f.tmdbId = c.tmdbId;
			items.set(id, f);
			stats.fromJellyfin++;
		} else if (c) {
			items.set(id, { ...c, inLibrary: false });
			stats.fromCache++;
		}
	}

	// 2) Jellystat archive for anything still unknown
	const unknown = ids.filter((id) => !items.has(id));
	if (unknown.length) log(`${unknown.length} played items are no longer in Jellyfin; consulting Jellystat's archive`);
	let done = 0;
	await mapLimit(unknown, 4, async (id) => {
		const d = await js.getItemDetails(id);
		const hint = hintById.get(id);
		if (d) {
			items.set(id, fromJellystatItem({ ...d, Id: id }, hint));
			stats.fromJellystat++;
		} else if (hint) {
			items.set(id, {
				id,
				type: hint.kind === 'episode' ? 'Episode' : hint.kind === 'series' ? 'Series' : 'Unknown',
				name: (hint.kind === 'series' ? hint.seriesName : hint.name) ?? 'Unknown title',
				year: null,
				runtimeSec: null,
				seriesId: hint.seriesId ?? null,
				seriesName: hint.seriesName ?? null,
				season: null,
				episode: null,
				genres: [],
				people: [],
				providerIds: {},
				primaryTag: null,
				backdropTag: null,
				inLibrary: false,
				source: 'playback'
			});
			stats.fromPlaybackOnly++;
		}
		progress(++done, unknown.length, 'Recovering deleted items');
	});

	// Make sure every episode's series is known (series ids come from the playback rows).
	// Jellystat hints guarantee series ids are in `ids`, so nothing extra to fetch here.

	// 3) TMDb identity for titles (movies + series)
	const titleItems = [...items.values()].filter((i) => i.type === 'Movie' || i.type === 'Series' || i.type === 'Unknown');
	let tdone = 0;
	await mapLimit(titleItems, 4, async (it) => {
		const mediaType: 'movie' | 'tv' = it.type === 'Series' ? 'tv' : 'movie';
		let tmdbId: number | null = Number(it.providerIds.tmdb) || it.tmdbId || null;
		if (!tmdbId) {
			const req = requestTmdb.get(it.id.toLowerCase().replace(/-/g, ''));
			if (req && req.type === mediaType) tmdbId = req.tmdbId;
		}
		if (!tmdbId && seerrEnabled()) {
			if (it.providerIds.imdb) tmdbId = await seerr.findByExternalId('imdb', it.providerIds.imdb, mediaType);
			if (!tmdbId && it.providerIds.tvdb && mediaType === 'tv') tmdbId = await seerr.findByExternalId('tvdb', it.providerIds.tvdb, 'tv');
			if (!tmdbId && !it.inLibrary && it.name && it.name !== 'Unknown title') tmdbId = await seerr.findByTitle(it.name, it.year, mediaType);
		}
		it.tmdbId = tmdbId;
		if (tmdbId) stats.tmdbResolved++;
		progress(++tdone, titleItems.length, 'Matching titles to TMDb');
	});

	// 4) TMDb details through Seerr (cached, refreshed every few days)
	const tmdbKeys = new Map<string, { id: number; mediaType: 'movie' | 'tv' }>();
	for (const it of titleItems) if (it.tmdbId) tmdbKeys.set(`tmdb:${it.type === 'Series' ? 'tv' : 'movie'}:${it.tmdbId}`, { id: it.tmdbId, mediaType: it.type === 'Series' ? 'tv' : 'movie' });
	const tmdbCached = cacheGet<TmdbCached>([...tmdbKeys.keys()]);
	const tmdb = new Map<string, TmdbCached>();
	let ddone = 0;
	await mapLimit([...tmdbKeys.entries()], 4, async ([key, { id, mediaType }]) => {
		const c = tmdbCached.get(key);
		if (c && Date.now() - c.fetchedAt < TMDB_TTL_MS) {
			tmdb.set(key, c);
		} else if (seerrEnabled()) {
			try {
				const entry = await fetchTmdb(mediaType, id);
				if (entry) tmdb.set(key, entry);
				else if (c) tmdb.set(key, c);
			} catch (e) {
				if (c) tmdb.set(key, c);
				else log(`TMDb details unavailable for ${key}: ${(e as Error).message}`);
			}
		} else if (c) tmdb.set(key, c);
		progress(++ddone, tmdbKeys.size, 'Fetching TMDb details via Seerr');
	});

	// 5) Persist item cache (so deleted items keep their identity next time)
	for (const it of items.values()) if (it.source !== 'playback' || it.tmdbId) cachePut(`jf:${it.id}`, it, it.source);

	// 6) Build titles + item metas
	const titles = new Map<string, TitleMeta>();
	const titleKeyByJf = new Map<string, string>();

	const buildTitle = (it: CachedItem, kind: 'movie' | 'series'): string => {
		const t = it.tmdbId ? tmdb.get(`tmdb:${kind === 'series' ? 'tv' : 'movie'}:${it.tmdbId}`) : undefined;
		const key = it.tmdbId ? `${kind}:tmdb:${it.tmdbId}` : `${kind}:jf:${it.id}`;
		titleKeyByJf.set(it.id, key);
		const existing = titles.get(key);
		if (existing) {
			// Same title present under multiple Jellyfin ids (re-added / duplicate versions)
			existing.jellyfinIds.push(it.id);
			if (it.inLibrary && existing.missingFromLibrary) {
				existing.missingFromLibrary = false;
				existing.poster = it.primaryTag ? jfArt(it.id, 'Primary', it.primaryTag, 500) : existing.poster;
			}
			return key;
		}
		const jfCast: CastMember[] = it.people
			.filter((p) => (p.type ?? 'Actor') === 'Actor')
			.map((p, i) => ({
				key: personKey(p.name),
				name: p.name,
				character: p.role ?? null,
				portrait: p.id && p.imageTag ? jfArt(p.id, 'Primary', p.imageTag, 400) : null,
				order: i
			}));
		const tmdbCast: CastMember[] = (t?.cast ?? []).map((c) => ({
			key: personKey(c.name),
			name: c.name,
			character: c.character,
			portrait: tmdbArt(c.profilePath, 'w500'),
			order: c.order
		}));
		// Prefer Jellyfin cast (matches the user's library); enrich missing portraits from TMDb.
		let cast = jfCast.length ? jfCast : tmdbCast;
		if (jfCast.length && tmdbCast.length) {
			const byKey = new Map(tmdbCast.map((c) => [c.key, c]));
			cast = jfCast.map((c) => (c.portrait ? c : { ...c, portrait: byKey.get(c.key)?.portrait ?? null }));
		}
		const poster = it.inLibrary && it.primaryTag ? jfArt(it.id, 'Primary', it.primaryTag, 500) : tmdbArt(t?.posterPath ?? null, 'w500');
		const backdrop = it.inLibrary && it.backdropTag ? jfArt(it.id, 'Backdrop', it.backdropTag, 1280) : tmdbArt(t?.backdropPath ?? null, 'w1280');
		titles.set(key, {
			key,
			kind,
			title: it.name || t?.title || 'Unknown title',
			year: it.year ?? t?.year ?? null,
			genres: normalizeGenres(it.genres.length ? it.genres : (t?.genres ?? [])),
			cast,
			popularity: t?.popularity ?? null,
			tmdbId: it.tmdbId ?? null,
			poster: poster ?? (t?.posterPath ? tmdbArt(t.posterPath, 'w500') : null),
			backdrop: backdrop ?? (t?.backdropPath ? tmdbArt(t.backdropPath, 'w1280') : null),
			seasonEpisodes: t?.seasons ?? null,
			jellyfinIds: [it.id],
			missingFromLibrary: !it.inLibrary
		});
		return key;
	};

	const metas = new Map<string, ItemMeta>();
	for (const it of items.values()) {
		if (it.type === 'Series') buildTitle(it, 'series');
	}
	for (const it of items.values()) {
		if (it.type === 'Movie' || (it.type === 'Unknown' && it.tmdbId)) {
			const titleKey = buildTitle(it, 'movie');
			metas.set(it.id, { id: it.id, kind: 'movie', titleKey, unitKey: titleKey, name: it.name, runtimeSec: it.runtimeSec ?? tmdb.get(`tmdb:movie:${it.tmdbId}`)?.runtimeSec ?? null, season: null, episode: null });
		} else if (it.type === 'Episode') {
			const hint = hintById.get(it.id);
			const seriesId = it.seriesId ?? hint?.seriesId ?? null;
			let titleKey = seriesId ? titleKeyByJf.get(seriesId) : undefined;
			if (!titleKey) {
				// Series item unknown: synthesize a series title from the episode's series name
				const pseudo: CachedItem = {
					...it,
					id: seriesId ?? `name:${personKey(it.seriesName ?? hint?.seriesName ?? 'unknown')}`,
					type: 'Series',
					name: it.seriesName ?? hint?.seriesName ?? 'Unknown series',
					people: [],
					providerIds: {},
					tmdbId: null,
					primaryTag: null,
					backdropTag: null
				};
				titleKey = buildTitle(pseudo, 'series');
			}
			const unitKey = it.season != null && it.episode != null ? `${titleKey}:s${it.season}e${it.episode}` : `${titleKey}:ep:${it.id}`;
			metas.set(it.id, { id: it.id, kind: 'episode', titleKey, unitKey, name: it.name, runtimeSec: it.runtimeSec, season: it.season, episode: it.episode });
		} else if (it.type !== 'Series') {
			stats.unresolvedTypes++;
		}
	}

	// Season episode counts for series without TMDb data: count from Jellyfin
	await mapLimit(
		[...titles.values()].filter((t) => t.kind === 'series' && !t.seasonEpisodes && !t.missingFromLibrary),
		3,
		async (t) => {
			const eps = await jf.getSeriesEpisodes(t.jellyfinIds[0]).catch(() => []);
			if (!eps.length) return;
			const counts: Record<number, number> = {};
			for (const e of eps) if (e.ParentIndexNumber && e.ParentIndexNumber > 0) counts[e.ParentIndexNumber] = (counts[e.ParentIndexNumber] ?? 0) + 1;
			t.seasonEpisodes = counts;
		}
	);

	for (const t of titles.values()) {
		if (t.popularity != null) stats.titlesWithPopularity++;
		if (t.missingFromLibrary) stats.titlesMissingFromLibrary++;
	}
	return { items: metas, titles, stats };
}
