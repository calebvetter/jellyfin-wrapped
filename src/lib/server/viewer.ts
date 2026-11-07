/** Shared loader for the story experience (login, personal link and admin preview). */
import { issueTrackingToken, type ViewMode } from './analytics';
import { customSfx, musicFor } from './soundtrack';
import type { CustomSfx, SfxName } from '$shared/sfx';
import type { MusicPlan } from './music-plan';
import { getSetting } from './db';
import { featuredYear, reportFor, yearsForUser } from './reports';

export interface ExperienceData {
	report: ReturnType<typeof reportFor>;
	years: number[];
	year: number | null;
	music: MusicPlan;
	/** Sound effects the admin replaced (others stay synthesized). */
	customSfx: Partial<Record<SfxName, CustomSfx>>;
	sfxEnabled: boolean;
	trackingToken: string | null;
	userName: string;
	/** ready | not-enough (prepared, but too little viewing) | not-prepared (no dataset yet) */
	state: 'ready' | 'not-enough' | 'not-prepared';
}

/**
 * Resolve which year to show and load the prepared report. `requestedYear` is honoured only
 * if this user has a prepared report for it. Analytics tokens are issued only for real
 * viewers (mode set), never for admin previews.
 */
export function loadExperience(userId: string, userName: string, requestedYear: string | null, mode: ViewMode | null): ExperienceData {
	const years = yearsForUser(userId);
	const wanted = Number(requestedYear);
	const featured = featuredYear();
	const year = years.includes(wanted) ? wanted : featured && years.includes(featured) ? featured : (years[0] ?? featured);
	const report = year ? reportFor(userId, year) : null;
	return {
		report,
		years,
		year,
		music: report ? musicFor(report) : { tracks: [], plan: [] },
		customSfx: customSfx(),
		sfxEnabled: getSetting('sfx_enabled') !== '0',
		trackingToken: report && mode ? issueTrackingToken(userId, report.year, mode, report.slides.length + 1) : null,
		userName: report?.userName ?? userName,
		state: report ? 'ready' : featured ? 'not-enough' : 'not-prepared'
	};
}
