import { json } from '@sveltejs/kit';
import { setIncluded } from '$lib/server/admin';
import type { RequestHandler } from './$types';

/** Users page checkboxes: { ids: string[], included: boolean } (admin-only via hooks). */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { ids?: unknown; included?: unknown };
	if (!Array.isArray(body.ids) || typeof body.included !== 'boolean') return json({ error: 'Bad request' }, { status: 400 });
	const ids = body.ids.filter((x): x is string => typeof x === 'string' && x.length <= 64).slice(0, 5000);
	return json({ updated: setIncluded(ids, body.included) });
};
