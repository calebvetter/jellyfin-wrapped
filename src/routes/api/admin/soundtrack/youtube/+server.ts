import { json } from '@sveltejs/kit';
import { addYouTube } from '$lib/server/soundtrack';
import type { RequestHandler } from './$types';

/** Grab audio from a YouTube link (yt-dlp) and use it for a title. Takes up to a minute. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { key?: string; url?: string };
	if (!body.key || !body.url) return json({ error: 'Paste a YouTube link' }, { status: 400 });
	try {
		const row = await addYouTube(String(body.key), String(body.url).slice(0, 500));
		return json({ id: row.id, title: row.track_title, duration: row.duration });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};
