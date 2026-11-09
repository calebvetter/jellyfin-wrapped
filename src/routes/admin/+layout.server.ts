import { activeYears, featuredYear } from '$lib/server/reports';
import { problems } from '$lib/server/admin';
import { config } from '$lib/server/config';
import { savedDefaultTimezone } from '$lib/server/timezone';
import type { LayoutServerLoad } from './$types';

// Access is enforced in hooks.server.ts (Jellyfin administrators only).
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user!,
		problems: problems(),
		years: activeYears(),
		featured: featuredYear(),
		mockPreview: config().mockPreview,
		/** false until an admin's browser timezone (or a choice on the dashboard) is saved */
		timezoneSaved: savedDefaultTimezone() !== null
	};
};
