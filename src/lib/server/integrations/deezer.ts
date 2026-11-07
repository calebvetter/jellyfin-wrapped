/**
 * Deezer public API (no key): finds a movie/show's soundtrack album, its tracks ordered by
 * popularity (`rank`), and each track's 30-second preview (used to locate the song's hook
 * inside an uploaded full track). Only titles of movies/shows are ever sent — no user data.
 *
 * Quota: ~50 requests / 5 s per IP. Deezer reports errors in a 200 body:
 * {"error": {"code": 4, "message": "Quota limit exceeded"}} → we back off and retry.
 */
import { config } from '../config';

export interface DeezerAlbum {
	id: number;
	title: string;
	artist: string | null;
	cover: string | null; // 250x250 cover URL
	link: string;
	nbTracks: number | null;
	recordType: string | null;
	score?: number;
}

export interface DeezerTrack {
	id: number;
	title: string;
	artist: string | null;
	duration: number; // seconds
	rank: number; // popularity
	position: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function deezerEnabled(): boolean {
	return config().deezer.enabled;
}

async function call<T>(path: string, attempt = 0): Promise<T> {
	const res = await fetch(`${config().deezer.url}${path}`, {
		headers: { Accept: 'application/json', 'User-Agent': 'JellyfinWrapped/1.0 (self-hosted)' },
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
	const body = (await res.json()) as T & { error?: { code?: number; message?: string } };
	if (body && typeof body === 'object' && 'error' in body && body.error) {
		if (body.error.code === 4 && attempt < 4) {
			await sleep(1500 * (attempt + 1));
			return call<T>(path, attempt + 1);
		}
		if (body.error.code === 800) return { data: [] } as T; // "no data"
		throw new Error(`Deezer: ${body.error.message ?? 'error'}`);
	}
	return body;
}

interface RawAlbum {
	id: number;
	title: string;
	link: string;
	cover_medium?: string;
	nb_tracks?: number;
	record_type?: string;
	artist?: { name?: string };
}

interface RawTrack {
	id: number;
	title: string;
	duration: number;
	rank?: number;
	track_position?: number;
	preview?: string;
	artist?: { name?: string };
}

const toAlbum = (a: RawAlbum): DeezerAlbum => ({
	id: a.id,
	title: a.title,
	artist: a.artist?.name ?? null,
	cover: a.cover_medium ?? null,
	link: a.link,
	nbTracks: a.nb_tracks ?? null,
	recordType: a.record_type ?? null
});

export async function searchAlbums(query: string, limit = 10): Promise<DeezerAlbum[]> {
	const r = await call<{ data?: RawAlbum[] }>(`/search/album?q=${encodeURIComponent(query)}&limit=${limit}`);
	return (r.data ?? []).map(toAlbum);
}

export async function albumTracks(albumId: number): Promise<DeezerTrack[]> {
	const r = await call<{ data?: RawTrack[] }>(`/album/${albumId}/tracks?limit=200`);
	return (r.data ?? []).map((t) => ({
		id: t.id,
		title: t.title,
		artist: t.artist?.name ?? null,
		duration: t.duration,
		rank: t.rank ?? 0,
		position: t.track_position ?? null
	}));
}

export interface DeezerTrackHit extends DeezerTrack {
	album: string | null;
	cover: string | null;
}

/** Search any song (used for generic music not tied to a title). */
export async function searchTracks(query: string, limit = 15): Promise<DeezerTrackHit[]> {
	const r = await call<{ data?: (RawTrack & { album?: { title?: string; cover_medium?: string } })[] }>(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
	return (r.data ?? []).map((t) => ({
		id: t.id,
		title: t.title,
		artist: t.artist?.name ?? null,
		duration: t.duration,
		rank: t.rank ?? 0,
		position: t.track_position ?? null,
		album: t.album?.title ?? null,
		cover: t.album?.cover_medium ?? null
	}));
}

/** One track's details (title, artist, duration). */
export async function getTrack(trackId: number): Promise<DeezerTrack | null> {
	const t = await call<RawTrack & { error?: unknown }>(`/track/${trackId}`);
	if (!t?.id) return null;
	return { id: t.id, title: t.title, artist: t.artist?.name ?? null, duration: t.duration, rank: t.rank ?? 0, position: t.track_position ?? null };
}

/** A fresh preview URL for a track (Deezer preview URLs are signed and expire). */
export async function previewUrl(trackId: number): Promise<string | null> {
	const t = await call<RawTrack>(`/track/${trackId}`);
	return t.preview || null;
}

// ------------------------------------------------------------------ matching

export function normTitle(s: string): string {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

const GOOD = /\b(soundtrack|original score|music from|motion picture|original series|series soundtrack|theme|ost|score|music of)\b/;
const BAD = /\b(inspired by|karaoke|tribute|piano (version|covers?)|lullab(y|ies)|8 bit|ringtone|workout|music box|guitar (version|covers?)|cello|orchestral covers?|covers?|parody|remix(es)?|chillout|lofi|lo fi|relax|meditation|sleep)\b/;

/**
 * How likely an album is the soundtrack of a title (higher is better; < 3 = reject).
 * The title must appear as whole words; "soundtrack"-ish words help, cover/tribute albums
 * are penalised, and extra unrelated words in the album title cost a little.
 */
export function scoreAlbum(album: { title: string; recordType?: string | null; nbTracks?: number | null }, title: string, kind: 'movie' | 'series', year?: number | null): number {
	const a = normTitle(album.title);
	const full = normTitle(title.replace(/\s*\(\d{4}\)\s*$/, ''));
	// a leading "The" is optional ("The Aristocats" vs "Aristocats")
	const t = ` ${a} `.includes(` ${full} `) ? full : full.replace(/^the /, '');
	if (!t || !` ${a} `.includes(` ${t} `)) return -1;
	let s = 0;
	if (a.startsWith(t)) s += 3;
	if (GOOD.test(a)) s += 4;
	if (kind === 'series' && /\b(series|season|television|tv)\b/.test(a)) s += 2;
	if (kind === 'movie' && /\b(motion picture|film|movie)\b/.test(a)) s += 2;
	if (BAD.test(a)) s -= 8;
	if (/\b(game|video game|gaming)\b/.test(a) && !/\bgame\b/.test(t)) s -= 6;
	if (album.recordType === 'single' && kind === 'movie') s -= 1;
	if ((album.nbTracks ?? 0) >= 5) s += 1;
	if (year && a.includes(String(year))) s += 1;
	const known = new Set(`${t} original motion picture soundtrack score music from the series television tv season theme ost expanded edition deluxe volume vol 1 2 3 a the from anniversary official netflix hbo amazon apple disney`.split(' '));
	const extra = a.split(' ').filter((w) => w && !known.has(w)).length;
	s -= extra * 0.4;
	return Math.round(s * 10) / 10;
}

export const MIN_ALBUM_SCORE = 3;
/** Matches below this are shown to the admin as "please confirm". */
export const CONFIDENT_ALBUM_SCORE = 6;
const LOW_CONFIDENCE_SCORE = 3.5;

/** Search Deezer for a title's soundtrack album candidates, best first. */
export async function findSoundtrackAlbums(title: string, kind: 'movie' | 'series', year: number | null): Promise<DeezerAlbum[]> {
	const base = title.replace(/\s*\(\d{4}\)\s*$/, '');
	const queries = kind === 'movie' ? [`${base} soundtrack`, `${base} original score`] : [`${base} soundtrack`, `${base} theme`];
	const byId = new Map<number, DeezerAlbum & { order: number }>();
	let order = 0;
	for (const q of queries) {
		for (const a of await searchAlbums(q)) {
			order++;
			if (byId.has(a.id)) continue;
			byId.set(a.id, { ...a, score: scoreAlbum(a, base, kind, year), order });
		}
	}
	// Some soundtracks are filed under the bare title ("The Aristocats"). Only if nothing
	// better was found, try that — capped at low confidence so an admin confirms it.
	if (![...byId.values()].some((a) => (a.score ?? 0) >= MIN_ALBUM_SCORE)) {
		for (const a of await searchAlbums(base)) {
			order++;
			if (byId.has(a.id)) continue;
			const score = Math.min(LOW_CONFIDENCE_SCORE, scoreAlbum(a, base, kind, year));
			byId.set(a.id, { ...a, score, order });
		}
	}
	// ties go to Deezer's own relevance order (usually the best-known release)
	return [...byId.values()]
		.filter((a) => (a.score ?? -1) >= 0)
		.sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || x.order - y.order)
		.slice(0, 8)
		.map(({ order: _o, ...a }) => a);
}
