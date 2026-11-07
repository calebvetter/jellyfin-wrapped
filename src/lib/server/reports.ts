/** Read access to prepared datasets and reports (no recalculation at play time). */
import { all, get, getSetting } from './db';
import type { WrappedReport } from '$shared/report';

export interface DatasetRow {
	id: number;
	year: number;
	status: string;
	started_at: number;
	finished_at: number | null;
	range_start: number;
	range_end: number;
	timezone: string;
	started_by: string | null;
	progress: string | null;
	completeness: string | null;
	cue_sheet: string | null;
	log: string | null;
	error: string | null;
}

export function activeDataset(year: number): DatasetRow | undefined {
	return get<DatasetRow>('SELECT d.* FROM active_datasets a JOIN datasets d ON d.id = a.dataset_id WHERE a.year = ?', year);
}

export function activeYears(): number[] {
	return all<{ year: number }>('SELECT year FROM active_datasets ORDER BY year DESC').map((r) => r.year);
}

/** The year ordinary viewers land on: admin-selected featured year, else the newest prepared year. */
export function featuredYear(): number | null {
	const years = activeYears();
	const pinned = Number(getSetting('featured_year'));
	if (pinned && years.includes(pinned)) return pinned;
	return years[0] ?? null;
}

export function reportFor(userId: string, year: number): WrappedReport | null {
	const row = get<{ report: string }>(
		'SELECT r.report FROM reports r JOIN active_datasets a ON a.dataset_id = r.dataset_id WHERE a.year = ? AND r.user_id = ?',
		year,
		userId
	);
	return row ? (JSON.parse(row.report) as WrappedReport) : null;
}

export function statsFor(userId: string, year: number): Record<string, unknown> | null {
	const row = get<{ stats: string }>(
		'SELECT r.stats FROM reports r JOIN active_datasets a ON a.dataset_id = r.dataset_id WHERE a.year = ? AND r.user_id = ?',
		year,
		userId
	);
	return row ? JSON.parse(row.stats) : null;
}

/** Years in which this user has a prepared report. */
export function yearsForUser(userId: string): number[] {
	return all<{ year: number }>(
		'SELECT a.year FROM reports r JOIN active_datasets a ON a.dataset_id = r.dataset_id WHERE r.user_id = ? ORDER BY a.year DESC',
		userId
	).map((r) => r.year);
}

export function reportSummaries(year: number) {
	return all<{ user_id: string; user_name: string; slide_count: number; minutes: number }>(
		'SELECT r.user_id, r.user_name, r.slide_count, r.minutes FROM reports r JOIN active_datasets a ON a.dataset_id = r.dataset_id WHERE a.year = ?',
		year
	);
}

export function datasets(limit = 30): DatasetRow[] {
	return all<DatasetRow>('SELECT * FROM datasets ORDER BY id DESC LIMIT ?', limit);
}

/** Every prepared report for a year (used to derive the soundtrack cue sheet). */
export function reportsForYear(year: number): WrappedReport[] {
	return all<{ report: string }>(
		'SELECT r.report FROM reports r JOIN active_datasets a ON a.dataset_id = r.dataset_id WHERE a.year = ?',
		year
	).map((r) => JSON.parse(r.report) as WrappedReport);
}
