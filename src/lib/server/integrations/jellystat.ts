/**
 * Jellystat client. Verified against Jellystat 1.1.x source:
 *  - auth: `x-api-token` header
 *  - raw rows: GET /stats/getPlaybackActivity (flat jf_playback_activity rows, filterable, paged)
 *  - ActivityDateInserted = session END time for live rows (pauses excluded from
 *    PlaybackDuration, seconds). Rows imported from the Playback Reporting plugin
 *    (imported=true) carry the plugin's DateCreated, i.e. the START time.
 *  - For episodes NowPlayingItemId is the SERIES id and EpisodeId the episode id.
 *  - POST /api/getItemDetails returns metadata even for archived (deleted) items.
 */
import { config } from '../config';
import { requestJson } from './http';
import { env } from '$env/dynamic/private';

export interface JellystatRow {
	Id: string;
	UserId: string;
	UserName: string | null;
	NowPlayingItemId: string;
	NowPlayingItemName: string | null;
	EpisodeId: string | null;
	SeasonId: string | null;
	SeriesName: string | null;
	PlaybackDuration: number | string;
	ActivityDateInserted: string;
	Client?: string | null;
	DeviceName?: string | null;
	PlayMethod?: string | null;
	imported?: boolean | null;
}

interface Paged<T> {
	current_page: number;
	pages: number;
	size: number;
	results: T[];
}

export interface JellystatItemDetails {
	Id: string;
	Name: string;
	Type?: string;
	ProductionYear?: number | string | null;
	PremiereDate?: string | null;
	RunTimeTicks?: number | string | null;
	Genres?: string[] | null;
	SeriesId?: string | null;
	SeriesName?: string | null;
	IndexNumber?: number | null;
	ParentIndexNumber?: number | null;
	archived?: boolean;
}

function headers() {
	return { 'x-api-token': config().jellystat.apiKey };
}

function base() {
	return config().jellystat.url;
}

export async function ping(): Promise<boolean> {
	const r = await requestJson<Paged<JellystatRow>>(
		'Jellystat',
		`${base()}/stats/getPlaybackActivity?size=1&page=1`,
		{ headers: headers(), retries: 0, timeoutMs: 8000 }
	);
	return Array.isArray(r?.results);
}

/**
 * Fetch every playback row whose ActivityDateInserted falls within [from, to].
 * Pages ascending by insert time so pages stay stable while new rows are written.
 */
export async function fetchPlaybackActivity(
	from: Date,
	to: Date,
	onProgress?: (fetched: number, pages: number) => void
): Promise<JellystatRow[]> {
	const size = 2000;
	const filters = JSON.stringify([{ field: 'ActivityDateInserted', min: from.toISOString(), max: to.toISOString() }]);
	const seen = new Map<string, JellystatRow>();
	let page = 1;
	let pages = 1;
	do {
		const qs = new URLSearchParams({
			size: String(size),
			page: String(page),
			sort: 'ActivityDateInserted',
			desc: 'false',
			filters
		});
		const r = await requestJson<Paged<JellystatRow>>('Jellystat', `${base()}/stats/getPlaybackActivity?${qs}`, {
			headers: headers(),
			timeoutMs: 120_000
		});
		if (!r || !Array.isArray(r.results)) throw new Error('Jellystat returned an unexpected playback response');
		for (const row of r.results) if (row?.Id != null) seen.set(String(row.Id), row);
		pages = Number(r.pages) || 1;
		onProgress?.(seen.size, pages);
		if (r.results.length < size) break;
		page++;
	} while (page <= pages + 1 && page < 1000);
	return [...seen.values()];
}

export async function getItemDetails(id: string): Promise<JellystatItemDetails | null> {
	try {
		const r = await requestJson<JellystatItemDetails[] | JellystatItemDetails>('Jellystat', `${base()}/api/getItemDetails`, {
			method: 'POST',
			headers: headers(),
			body: { Id: id },
			allow404: true,
			retries: 1
		});
		if (!r) return null;
		const item = Array.isArray(r) ? r[0] : r;
		return item && typeof item === 'object' && 'Name' in item ? item : null;
	} catch {
		return null;
	}
}

/**
 * Timestamps of imported Playback Reporting rows were stored without an offset. If the
 * plugin recorded server-local wall-clock time, set JELLYSTAT_IMPORTED_TZ to that zone and
 * the value is reinterpreted accordingly.
 */
export function importedTimezone(): string | null {
	const tz = (env.JELLYSTAT_IMPORTED_TZ ?? process.env.JELLYSTAT_IMPORTED_TZ ?? '').trim();
	return tz || null;
}
