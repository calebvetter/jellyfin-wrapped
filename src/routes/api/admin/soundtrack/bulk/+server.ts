import { json } from '@sveltejs/kit';
import { featuredYear, reportsForYear } from '$lib/server/reports';
import { featuredTitles, selectTopTracks } from '$lib/server/soundtrack';
import type { RequestHandler } from './$types';

/** Use each featured title's most popular track wherever no music is chosen yet. */
export const POST: RequestHandler = async () => {
	const year = featuredYear();
	if (!year) return json({ error: 'Prepare a year first' }, { status: 400 });
	const keys = featuredTitles(reportsForYear(year)).map((f) => f.key);
	return json(await selectTopTracks(keys));
};
