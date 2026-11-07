import { activeYears, featuredYear } from '$lib/server/reports';
import { problems } from '$lib/server/admin';
import { config } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';

// Access is enforced in hooks.server.ts (Jellyfin administrators only).
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user!,
		problems: problems(),
		years: activeYears(),
		featured: featuredYear(),
		timezone: config().timezone,
		mockPreview: config().mockPreview
	};
};
