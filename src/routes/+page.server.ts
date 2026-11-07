import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { authenticateUser, InvalidCredentialsError } from '$lib/server/integrations/jellyfin';
import { createSession, cookieOptions, SESSION_COOKIE } from '$lib/server/auth/session';
import { isThrottled, recordFailure } from '$lib/server/links';
import { safeNext } from '$lib/server/auth/guard';
import { config } from '$lib/server/config';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next'), locals.user.isAdmin));
	return { configured: Boolean(config().jellyfin.url), mockPreview: config().mockPreview };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const ip = `login:${getClientAddress()}`;
		if (isThrottled(ip)) return fail(429, { error: 'Too many attempts. Please wait a few minutes and try again.', username: '' });
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!username) return fail(400, { error: 'Enter your Jellyfin username.', username });
		if (!config().jellyfin.url) return fail(500, { error: 'Jellyfin is not configured on this server.', username });
		try {
			const user = await authenticateUser(username, password);
			if (user.Policy?.IsDisabled) return fail(403, { error: 'This Jellyfin account is disabled.', username });
			const { cookie, expires } = createSession(user);
			cookies.set(SESSION_COOKIE, cookie, cookieOptions(url, expires));
			redirect(303, safeNext(url.searchParams.get('next'), Boolean(user.Policy?.IsAdministrator)));
		} catch (e) {
			if (isRedirect(e)) throw e;
			if (e instanceof InvalidCredentialsError) {
				recordFailure(ip);
				return fail(401, { error: 'That username and password didn’t work.', username });
			}
			console.error('[login] Jellyfin error:', (e as Error).message);
			return fail(502, { error: 'Couldn’t reach Jellyfin. Try again in a moment.', username });
		}
	}
};
