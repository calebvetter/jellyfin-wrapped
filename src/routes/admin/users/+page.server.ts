import { fail } from '@sveltejs/kit';
import { listUserRows, syncUsers, userLink } from '$lib/server/admin';
import { featuredYear, reportSummaries } from '$lib/server/reports';
import { engagementByUser } from '$lib/server/analytics';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const year = Number(url.searchParams.get('year')) || featuredYear();
	const reports = year ? Object.fromEntries(reportSummaries(year).map((r) => [r.user_id, r])) : {};
	const engagement = year ? Object.fromEntries(engagementByUser(year).map((e) => [e.user_id, e])) : {};
	return {
		year,
		users: listUserRows().map((u) => ({
			...u,
			report: reports[u.id] ?? null,
			engagement: engagement[u.id] ?? null,
			// personal links are created automatically when Wrappeds are prepared
			linkUrl: userLink(u.id, url.origin)?.url ?? null
		}))
	};
};

export const actions: Actions = {
	sync: async () => {
		try {
			return { synced: await syncUsers() };
		} catch (e) {
			return fail(502, { error: `Couldn't load users from Jellyfin: ${(e as Error).message}` });
		}
	}
};
