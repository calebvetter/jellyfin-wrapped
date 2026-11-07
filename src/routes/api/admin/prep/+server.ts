import { json } from '@sveltejs/kit';
import { currentRun } from '$lib/server/prep/runner';
import type { RequestHandler } from './$types';

/** Live preparation progress for the admin dashboard (admin-only via hooks). */
export const GET: RequestHandler = () => json({ run: currentRun() }, { headers: { 'Cache-Control': 'no-store' } });
