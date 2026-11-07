import { analyticsYears, engagementBySlide, engagementByUser } from '$lib/server/analytics';
import { featuredYear } from '$lib/server/reports';
import { listUserRows } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const years = analyticsYears();
	const year = Number(url.searchParams.get('year')) || featuredYear() || years[0] || null;
	const names = Object.fromEntries(listUserRows().map((u) => [u.id, u.name]));
	const users = year ? engagementByUser(year).map((e) => ({ ...e, name: names[e.user_id] ?? e.user_id })) : [];
	const slides = year ? engagementBySlide(year) : { totalVisits: 0, slides: [] };
	const totals = users.reduce(
		(acc, u) => {
			acc.visits += u.visits;
			acc.sessions += u.sessions;
			acc.completed += u.completed_visits;
			acc.rewatches += u.rewatches;
			acc.activeMs += u.active_ms;
			acc.linkVisits += u.link_visits;
			return acc;
		},
		{ visits: 0, sessions: 0, completed: 0, rewatches: 0, activeMs: 0, linkVisits: 0 }
	);
	return { years, year, users, slides, totals, viewers: users.length };
};
