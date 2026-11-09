import { error, fail } from '@sveltejs/kit';
import { get } from '$lib/server/db';
import { featuredYear, reportFor, statsFor, yearsForUser } from '$lib/server/reports';
import { engagementByUser, recentVisits, userSlideEngagement } from '$lib/server/analytics';
import { createLink, revokeUserLinks } from '$lib/server/links';
import { userLink } from '$lib/server/admin';
import type { UserRow } from '$lib/server/admin';
import { defaultTimezone, setUserTimezone, userTimezone } from '$lib/server/timezone';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	const user = get<UserRow>('SELECT id, name, is_admin, is_disabled, last_activity, synced_at FROM users WHERE id = ?', params.id);
	if (!user) error(404, 'User not found');
	const years = yearsForUser(user.id);
	const wanted = Number(url.searchParams.get('year'));
	const year = years.includes(wanted) ? wanted : (featuredYear() ?? years[0] ?? null);
	const report = year ? reportFor(user.id, year) : null;
	return {
		profile: user,
		years,
		year,
		slides: report?.slides.map((s) => s.kind) ?? [],
		timezone: userTimezone(user.id), // null = the default
		defaultTimezone: defaultTimezone(),
		preparedIn: report?.timezone ?? null,
		stats: year ? statsFor(user.id, year) : null,
		link: userLink(user.id, url.origin),
		engagement: year ? (engagementByUser(year).find((e) => e.user_id === user.id) ?? null) : null,
		slideEngagement: year ? userSlideEngagement(user.id, year) : [],
		visits: year ? recentVisits(user.id, year) : []
	};
};

export const actions: Actions = {
	link: async ({ params, locals, url }) => {
		const exists = get<{ id: string }>('SELECT id FROM users WHERE id = ?', params.id);
		if (!exists) return fail(404, { error: 'User not found' });
		const { token } = createLink(params.id, locals.user?.name ?? null);
		return { linkUrl: `${url.origin}/w/${token}` };
	},
	timezone: async ({ params, request }) => {
		const tz = String((await request.formData()).get('timezone') ?? '').trim();
		try {
			return { timezoneSaved: setUserTimezone(params.id, tz || null) ?? '' };
		} catch {
			return fail(400, { error: `Unknown timezone "${tz}"` });
		}
	},
	revoke: async ({ params }) => {
		const n = revokeUserLinks(params.id);
		return { revoked: n };
	}
};
