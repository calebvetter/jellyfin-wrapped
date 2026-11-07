import { json } from '@sveltejs/kit';
import { chooseAlbum, clearSelection, confirmAlbum, lookupTitle, selectTrack, setMusicOff, titleMatches, withLocalCovers } from '$lib/server/soundtrack';
import { findSoundtrackAlbums, scoreAlbum, searchAlbums, type DeezerAlbum } from '$lib/server/integrations/deezer';
import { get } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * Per-title soundtrack actions:
 *   { key, action: 'select', trackId }      use this track (its 30 s Deezer preview is cached)
 *   { key, action: 'clear' }                remove the selected track
 *   { key, action: 'musicOff' | 'musicOn' } confirm the title gets no music (or undo)
 *   { key, action: 'lookup' }               re-run the automatic Deezer match
 *   { key, action: 'confirm' }              accept the automatic match
 *   { key, action: 'choose', albumId }      use one of the candidate / searched albums
 *   { key, action: 'none' }                 this title has no soundtrack
 *   { key, action: 'search', query }        search Deezer albums (returns candidates)
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { key?: string; action?: string; albumId?: number; trackId?: number; query?: string };
	const key = String(body.key ?? '');
	const row = get<{ title: string; kind: 'movie' | 'series'; year: number | null }>('SELECT title, kind, year FROM soundtrack_titles WHERE title_key = ?', key);
	if (!row) return json({ error: 'Unknown title' }, { status: 404 });
	try {
		switch (body.action) {
			case 'select': {
				if (!Number.isInteger(body.trackId)) return json({ error: 'Bad track id' }, { status: 400 });
				const a = await selectTrack(key, body.trackId as number);
				return json({ id: a.id });
			}
			case 'musicOff':
				setMusicOff(key, true);
				return json({ ok: true });
			case 'musicOn':
				setMusicOff(key, false);
				return json({ ok: true });
			case 'clear':
				clearSelection(key);
				return json({ ok: true });
			case 'lookup':
				return json({ status: await lookupTitle(key) });
			case 'confirm':
				confirmAlbum(key);
				return json({ ok: true });
			case 'none':
				await chooseAlbum(key, null);
				return json({ ok: true });
			case 'choose': {
				const m = titleMatches().get(key);
				const pool: DeezerAlbum[] = [...(m?.candidates ?? []), ...(searchCache.get(key) ?? [])];
				const album = pool.find((a) => a.id === body.albumId);
				if (!album) return json({ error: 'Album not found' }, { status: 400 });
				await chooseAlbum(key, album);
				return json({ ok: true });
			}
			case 'search': {
				const q = String(body.query ?? '').trim().slice(0, 120);
				const found = q ? await searchAlbums(q, 12) : await findSoundtrackAlbums(row.title, row.kind, row.year);
				const scored = found.map((a) => ({ ...a, score: a.score ?? scoreAlbum(a, row.title, row.kind, row.year) }));
				searchCache.set(key, scored);
				return json({ results: await withLocalCovers(scored) });
			}
			default:
				return json({ error: 'Unknown action' }, { status: 400 });
		}
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};

/** Albums from the admin's most recent search per title (original covers), so 'choose' can use them. */
const searchCache = new Map<string, DeezerAlbum[]>();
