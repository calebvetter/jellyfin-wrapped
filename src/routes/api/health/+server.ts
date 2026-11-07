import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Liveness/readiness for Docker HEALTHCHECK and reverse proxies. Reveals no configuration. */
export const GET: RequestHandler = () => {
	try {
		getDb().prepare('SELECT 1').get();
		return json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ status: 'error' }, { status: 503 });
	}
};
