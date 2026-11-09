import { fail } from '@sveltejs/kit';
import { cancelRun, currentRun, startPreparation } from '$lib/server/prep/runner';
import { datasets } from '$lib/server/reports';
import { checkServices } from '$lib/server/admin';
import { all, get, setSetting } from '$lib/server/db';
import { defaultTimezone, savedDefaultTimezone, setDefaultTimezone } from '$lib/server/timezone';
import { toLocal } from '$lib/server/prep/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const currentYear = new Date(toLocal(Date.now(), defaultTimezone())).getUTCFullYear();
	const counts = all<{ dataset_id: number; users: number; minutes: number }>(
		'SELECT dataset_id, COUNT(*) AS users, SUM(minutes) AS minutes FROM reports GROUP BY dataset_id'
	);
	const countMap = Object.fromEntries(counts.map((c) => [c.dataset_id, c]));
	const active = all<{ year: number; dataset_id: number; activated_at: number }>('SELECT * FROM active_datasets ORDER BY year DESC');
	return {
		currentYear,
		/** null until an admin picks one; the page then pre-selects the admin's browser timezone */
		timezone: savedDefaultTimezone(),
		userOverrides: all<{ name: string; timezone: string }>('SELECT name, timezone FROM users WHERE included = 1 AND timezone IS NOT NULL ORDER BY name'),
		selectedUsers: get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE included = 1")?.n ?? 0,
		totalUsers: get<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0,
		run: currentRun(),
		active,
		datasets: datasets(25).map((d) => ({
			id: d.id,
			year: d.year,
			status: d.status,
			startedAt: d.started_at,
			finishedAt: d.finished_at,
			rangeStart: d.range_start,
			rangeEnd: d.range_end,
			timezone: d.timezone,
			startedBy: d.started_by,
			error: d.error,
			completeness: d.completeness ? JSON.parse(d.completeness) : null,
			reports: countMap[d.id]?.users ?? 0,
			minutes: countMap[d.id]?.minutes ?? 0
		}))
	};
};

export const actions: Actions = {
	prepare: async ({ request, locals }) => {
		const form = await request.formData();
		const year = Number(form.get('year'));
		const tz = String(form.get('timezone') ?? '');
		try {
			setDefaultTimezone(tz);
		} catch {
			return fail(400, { error: 'Choose a valid timezone first' });
		}
		const r = startPreparation(year, locals.user?.name ?? null);
		if (!r.ok) return fail(400, { error: r.error });
		return { started: r.datasetId };
	},
	timezone: async ({ request }) => {
		const tz = String((await request.formData()).get('timezone') ?? '');
		try {
			return { timezoneSaved: setDefaultTimezone(tz) };
		} catch {
			return fail(400, { error: `Unknown timezone "${tz}"` });
		}
	},
	cancel: async () => {
		if (!cancelRun()) return fail(400, { error: 'Nothing is running' });
		return { cancelled: true };
	},
	feature: async ({ request }) => {
		const form = await request.formData();
		const year = String(form.get('year') ?? '');
		setSetting('featured_year', /^\d{4}$/.test(year) ? year : null);
		return { featured: year || null };
	},
	test: async () => {
		return { services: await checkServices() };
	}
};
