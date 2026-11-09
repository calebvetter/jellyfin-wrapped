import { json } from '@sveltejs/kit';
import { savedDefaultTimezone, setDefaultTimezone } from '$lib/server/timezone';
import type { RequestHandler } from './$types';

/**
 * First-run default: the admin layout posts the admin's browser timezone here when no
 * default has been saved yet, so every page (and each user's "Default") agrees from the
 * start. Never overwrites a saved choice; changing it is the dashboard's job (?/timezone).
 */
export const POST: RequestHandler = async ({ request }) => {
	const existing = savedDefaultTimezone();
	if (existing) return json({ timezone: existing, saved: false });
	const body = (await request.json().catch(() => ({}))) as { timezone?: unknown };
	try {
		return json({ timezone: setDefaultTimezone(String(body.timezone ?? '')), saved: true });
	} catch {
		return json({ error: 'Unknown timezone' }, { status: 400 });
	}
};
