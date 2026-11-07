import { error } from '@sveltejs/kit';
import { isThrottled, recordFailure, resolveLinkToken } from '$lib/server/links';
import { loadExperience } from '$lib/server/viewer';
import { get } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/**
 * Passwordless personal link. The token is a bearer credential granting read access to
 * exactly one user's prepared Wrapped — no session, no admin features, no other users.
 * Invalid tokens get a generic 404 and count toward a per-client throttle.
 */
export const load: PageServerLoad = ({ params, url, getClientAddress, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
	const client = `link:${getClientAddress()}`;
	if (isThrottled(client)) error(429, 'Too many requests');
	const link = resolveLinkToken(params.token);
	if (!link) {
		recordFailure(client);
		error(404, 'Not found');
	}
	const user = get<{ name: string }>('SELECT name FROM users WHERE id = ?', link.userId);
	return loadExperience(link.userId, user?.name ?? 'there', url.searchParams.get('year'), 'link');
};
