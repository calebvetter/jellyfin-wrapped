import { json } from '@sveltejs/kit';
import { audioById, deleteAudio, setSegment, updateAudio } from '$lib/server/soundtrack';
import type { RequestHandler } from './$types';

/** Adjust a title's audio: enabled, volume, or the segment to play ({ start, end }). */
export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!audioById(params.id)) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	try {
		if (typeof body.start === 'number') setSegment(params.id, body.start, typeof body.end === 'number' ? body.end : null);
		updateAudio(params.id, {
			enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
			gain: typeof body.gain === 'number' ? body.gain : undefined
		});
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 400 });
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params }) => {
	deleteAudio(params.id);
	return json({ ok: true });
};
