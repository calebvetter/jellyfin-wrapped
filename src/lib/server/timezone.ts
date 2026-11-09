/**
 * Timezones used for preparation: days, streaks, binge dates and year boundaries.
 *
 * - The server default is an admin setting (dashboard). The first admin page visit saves the
 *   admin's browser timezone as the default (POST /api/admin/timezone, never overwriting a
 *   saved choice); only before that does the server fall back to UTC.
 * - Each user can be given their own timezone (admin user page), e.g. someone who lives
 *   abroad. Unset = the server default.
 */
import { get, getSetting, run, setSetting } from './db';
import { canonicalTimezone, isValidTimezone } from '$shared/clock';

const KEY = 'timezone';

/** The saved server default, or null if no admin has chosen one yet. */
export function savedDefaultTimezone(): string | null {
	const tz = getSetting(KEY);
	return tz && isValidTimezone(tz) ? tz : null;
}

export function defaultTimezone(): string {
	return savedDefaultTimezone() ?? 'UTC';
}

export function setDefaultTimezone(tz: string): string {
	const c = canonicalTimezone(tz);
	if (!c) throw new Error(`Unknown timezone "${tz}"`);
	setSetting(KEY, c);
	return c;
}

/** A user's own timezone, or null to use the server default. */
export function userTimezone(userId: string): string | null {
	const tz = get<{ timezone: string | null }>('SELECT timezone FROM users WHERE id = ?', userId)?.timezone ?? null;
	return tz && isValidTimezone(tz) ? tz : null;
}

export function setUserTimezone(userId: string, tz: string | null): string | null {
	const c = tz === null ? null : canonicalTimezone(tz);
	if (tz !== null && !c) throw new Error(`Unknown timezone "${tz}"`);
	run('UPDATE users SET timezone = ? WHERE id = ?', c, userId);
	return c;
}

/** The timezone a user's Wrapped is prepared in. */
export function timezoneFor(userId: string): string {
	return userTimezone(userId) ?? defaultTimezone();
}
