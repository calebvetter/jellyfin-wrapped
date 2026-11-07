import { error } from '@sveltejs/kit';
import { get } from '$lib/server/db';
import { loadExperience } from '$lib/server/viewer';
import type { PageServerLoad } from './$types';

/** Admin preview: exactly what the user sees, but no analytics token is issued. */
export const load: PageServerLoad = ({ params, url }) => {
	const user = get<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = ?', params.id);
	if (!user) error(404, 'User not found');
	return { ...loadExperience(user.id, user.name, url.searchParams.get('year'), null), userId: user.id };
};
