import { json } from '@sveltejs/kit';
import { isSfxName, resetSfx, setSfxFromYouTube, setSfxUpload } from '$lib/server/soundtrack';
import type { RequestHandler } from './$types';

/**
 * Replace a sound effect: multipart upload (field "file") or JSON { url } for a YouTube grab.
 * The admin then trims it with the segment editor (PATCH /api/admin/soundtrack/audio/<id>).
 */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!isSfxName(params.name)) return json({ error: 'Unknown sound effect' }, { status: 404 });
	try {
		if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
			const form = await request.formData();
			const file = form.get('file');
			if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose an audio file' }, { status: 400 });
			const duration = Number(form.get('duration'));
			const row = setSfxUpload(params.name, Buffer.from(await file.arrayBuffer()), file.name, file.type || 'audio/mpeg', Number.isFinite(duration) && duration > 0 ? duration : null);
			return json({ id: row.id });
		}
		const body = (await request.json().catch(() => ({}))) as { url?: string };
		if (!body.url) return json({ error: 'Paste a YouTube link' }, { status: 400 });
		return json({ id: (await setSfxFromYouTube(params.name, String(body.url).slice(0, 500))).id });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 400 });
	}
};

/** Reset to the built-in synthesized sound. */
export const DELETE: RequestHandler = ({ params }) => {
	if (!isSfxName(params.name)) return json({ error: 'Unknown sound effect' }, { status: 404 });
	resetSfx(params.name);
	return json({ ok: true });
};
