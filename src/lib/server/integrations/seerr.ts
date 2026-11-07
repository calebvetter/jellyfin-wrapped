/**
 * Seerr (Overseerr/Jellyseerr successor) client: request history plus TMDb metadata
 * (popularity, cast, artwork) proxied through Seerr so no separate TMDb key is needed.
 */
import { config, seerrEnabled } from '../config';
import { requestJson } from './http';

const base = () => `${config().seerr.url}/api/v1`;
const headers = () => ({ 'X-Api-Key': config().seerr.apiKey });

export interface SeerrRequest {
	id: number;
	status: number;
	createdAt: string;
	type: 'movie' | 'tv';
	media: {
		tmdbId: number;
		tvdbId?: number | null;
		imdbId?: string | null;
		mediaType: 'movie' | 'tv';
		jellyfinMediaId?: string | null;
		jellyfinMediaId4k?: string | null;
		status?: number;
	};
	requestedBy: { id: number; jellyfinUserId?: string | null; displayName?: string };
}

export interface SeerrCast {
	id: number;
	name: string;
	character?: string | null;
	profilePath?: string | null;
	order?: number;
}

export interface SeerrTitleDetails {
	id: number;
	title?: string; // movie
	name?: string; // tv
	posterPath?: string | null;
	backdropPath?: string | null;
	popularity?: number;
	releaseDate?: string | null;
	firstAirDate?: string | null;
	genres?: { id: number; name: string }[];
	runtime?: number | null;
	episodeRunTime?: number[];
	credits?: { cast?: SeerrCast[] };
	externalIds?: { imdbId?: string | null; tvdbId?: number | null };
	seasons?: { seasonNumber: number; episodeCount: number }[];
}

export interface SeerrSearchResult {
	id: number;
	mediaType: 'movie' | 'tv' | 'person';
	title?: string;
	name?: string;
	releaseDate?: string;
	firstAirDate?: string;
	popularity?: number;
}

/** Seerr rejects reserved characters (and '+') in query values: encode them all. */
export function encodeSeerrQuery(q: string): string {
	return encodeURIComponent(q).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function ping(): Promise<boolean> {
	if (!seerrEnabled()) return false;
	const r = await requestJson<{ version?: string }>('Seerr', `${base()}/status`, { headers: headers(), retries: 0, timeoutMs: 8000 });
	return Boolean(r);
}

/** All requests (every user), newest first. */
export async function fetchAllRequests(onProgress?: (n: number) => void): Promise<SeerrRequest[]> {
	const take = 100;
	const out: SeerrRequest[] = [];
	for (let skip = 0; skip < 100_000; skip += take) {
		const r = await requestJson<{ pageInfo: { pages: number; results: number }; results: SeerrRequest[] }>(
			'Seerr',
			`${base()}/request?take=${take}&skip=${skip}&filter=all&sort=added&sortDirection=desc`,
			{ headers: headers(), timeoutMs: 60_000 }
		);
		const results = r?.results ?? [];
		out.push(...results);
		onProgress?.(out.length);
		if (results.length < take) break;
	}
	return out;
}

export async function getMovie(tmdbId: number): Promise<SeerrTitleDetails | null> {
	return requestJson<SeerrTitleDetails>('Seerr', `${base()}/movie/${tmdbId}`, { headers: headers(), allow404: true, timeoutMs: 20_000 });
}

export async function getTv(tmdbId: number): Promise<SeerrTitleDetails | null> {
	return requestJson<SeerrTitleDetails>('Seerr', `${base()}/tv/${tmdbId}`, { headers: headers(), allow404: true, timeoutMs: 20_000 });
}

export async function search(query: string): Promise<SeerrSearchResult[]> {
	const r = await requestJson<{ results: SeerrSearchResult[] }>('Seerr', `${base()}/search?query=${encodeSeerrQuery(query)}&page=1`, {
		headers: headers(),
		allow404: true,
		timeoutMs: 20_000
	});
	return (r?.results ?? []).filter((x) => x.mediaType === 'movie' || x.mediaType === 'tv');
}

/** Resolve a TMDb id from IMDb / TVDB ids (Seerr maps these via TMDb /find). */
export async function findByExternalId(kind: 'imdb' | 'tvdb', id: string, mediaType: 'movie' | 'tv'): Promise<number | null> {
	const results = await search(`${kind}:${id}`).catch(() => []);
	return results.find((r) => r.mediaType === mediaType)?.id ?? null;
}

/** Fuzzy title(+year) lookup — last resort for items deleted from Jellyfin without ids. */
export async function findByTitle(title: string, year: number | null, mediaType: 'movie' | 'tv'): Promise<number | null> {
	const clean = title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
	if (!clean) return null;
	const query = year ? `year:${year} ${clean}` : clean;
	const results = await search(query).catch(() => []);
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
	const target = norm(clean);
	const candidates = results.filter((r) => r.mediaType === mediaType);
	const exact = candidates.find((r) => norm(r.title ?? r.name ?? '') === target);
	if (exact) return exact.id;
	// accept the top hit only if titles are close enough
	const top = candidates[0];
	if (top && norm(top.title ?? top.name ?? '').includes(target) && target.length >= 4) return top.id;
	return null;
}

/** Artwork via Seerr's anonymous image proxy (falls back to TMDb directly). */
export function tmdbImageUrls(path: string, size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280'): string[] {
	const p = path.startsWith('/') ? path : `/${path}`;
	const urls = [`https://image.tmdb.org/t/p/${size}${p}`];
	if (seerrEnabled()) urls.unshift(`${config().seerr.url}/imageproxy/tmdb/t/p/${size}${p}`);
	return urls;
}
