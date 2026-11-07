import { redirect } from '@sveltejs/kit';
import { destroySession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, url }) => {
	destroySession(cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, cookieOptions(url));
	redirect(303, '/');
};
