import { json } from '@sveltejs/kit';
import { get } from '$lib/server/db';
import { setUserTimezone } from '$lib/server/timezone';
import type { RequestHandler } from './$types';

/** Users page timezone column: { id, timezone: string | null } (null/'' = the default; admin-only via hooks). */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { id?: unknown; timezone?: unknown };
	if (typeof body.id !== 'string' || !(body.timezone === null || typeof body.timezone === 'string')) return json({ error: 'Bad request' }, { status: 400 });
	if (!get('SELECT 1 FROM users WHERE id = ?', body.id)) return json({ error: 'User not found' }, { status: 404 });
	try {
		return json({ timezone: setUserTimezone(body.id, body.timezone || null) });
	} catch {
		return json({ error: `Unknown timezone "${body.timezone}"` }, { status: 400 });
	}
};
