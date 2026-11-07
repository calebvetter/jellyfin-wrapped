import { json } from '@sveltejs/kit';
import { addGenericDeezer, addGenericYouTube, isMusicSlot, setSlot, withLocalCovers } from '$lib/server/soundtrack';
import { searchTracks } from '$lib/server/integrations/deezer';
import type { RequestHandler } from './$types';

/**
 * Generic music (not tied to a title):
 *   { action: 'youtube', url }               grab a YouTube link into the pool
 *   { action: 'search', query }              search Deezer songs
 *   { action: 'deezer', trackId }            add a Deezer song's 30 s preview to the pool
 *   { action: 'slot', slot, audioId | null } assign a pool track to a screen (null = default)
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { action?: string; url?: string; query?: string; trackId?: number; slot?: string; audioId?: string | null };
	try {
		switch (body.action) {
			case 'youtube':
				if (!body.url) return json({ error: 'Paste a YouTube link' }, { status: 400 });
				return json({ id: (await addGenericYouTube(String(body.url).slice(0, 500))).id });
			case 'search': {
				const q = String(body.query ?? '').trim().slice(0, 120);
				if (!q) return json({ results: [] });
				return json({ results: await withLocalCovers(await searchTracks(q, 12)) });
			}
			case 'deezer':
				if (!Number.isInteger(body.trackId)) return json({ error: 'Bad track id' }, { status: 400 });
				return json({ id: (await addGenericDeezer(body.trackId as number)).id });
			case 'slot':
				if (!body.slot || !isMusicSlot(body.slot)) return json({ error: 'Unknown screen' }, { status: 400 });
				setSlot(body.slot, body.audioId ?? null);
				return json({ ok: true });
			default:
				return json({ error: 'Unknown action' }, { status: 400 });
		}
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};
