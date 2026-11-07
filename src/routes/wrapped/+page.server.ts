import { redirect } from '@sveltejs/kit';
import { loadExperience } from '$lib/server/viewer';
import type { PageServerLoad } from './$types';

/** A signed-in user's own Wrapped (admins included — this is their real viewing). */
export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, '/');
	return { ...loadExperience(locals.user.id, locals.user.name, url.searchParams.get('year'), 'login'), isAdmin: locals.user.isAdmin };
};
