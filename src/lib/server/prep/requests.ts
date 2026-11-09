/**
 * Seerr request statistics, including the cross-user "Good Taste" metric:
 * how many distinct titles a user requested were later watched (meaningfully) by at
 * least one OTHER user. Computed only in the backend during preparation; reports only
 * ever receive counts, never who watched or what else they watched.
 */
import type { View } from './model';

export interface NormalizedRequest {
	userId: string; // normalized Jellyfin user id
	createdAt: number;
	mediaType: 'movie' | 'tv';
	tmdbId: number;
	jellyfinMediaId: string | null;
	status: number;
}

export const SEERR_REQUEST_DECLINED = 3;

export function normId(id: string | null | undefined): string {
	return (id ?? '').toLowerCase().replace(/-/g, '');
}

export interface RequestTitle {
	mediaType: 'movie' | 'tv';
	tmdbId: number;
	firstRequestedAt: number;
	keys: string[]; // candidate title keys
	jellyfinMediaId: string | null;
	/** Seconds watched by anyone (requester included) since the request, within the range. */
	seconds: number;
	/** Of which by other users (Good Taste). */
	othersSeconds: number;
}

export interface RequestStats {
	total: number; // distinct requested titles
	movies: number;
	shows: number;
	titles: RequestTitle[]; // most watched first
	goodTaste: RequestTitle[]; // most watched by others first
	goodTasteViewers: number;
}

/**
 * @param keysFor maps a request to the title keys its media may appear under in views
 *                (TMDb-keyed and Jellyfin-id-keyed variants)
 */
export function requestStats(
	userId: string,
	requests: NormalizedRequest[],
	allViews: View[],
	range: { rangeStart: number; rangeEnd: number },
	keysFor: (r: NormalizedRequest) => string[]
): RequestStats {
	const mine = requests.filter(
		(r) => r.userId === userId && r.status !== SEERR_REQUEST_DECLINED && r.createdAt >= range.rangeStart && r.createdAt < range.rangeEnd
	);
	const byTitle = new Map<string, RequestTitle>();
	for (const r of mine.sort((a, b) => a.createdAt - b.createdAt)) {
		const k = `${r.mediaType}:${r.tmdbId}`;
		const existing = byTitle.get(k);
		if (existing) {
			for (const key of keysFor(r)) if (!existing.keys.includes(key)) existing.keys.push(key);
			continue;
		}
		byTitle.set(k, { mediaType: r.mediaType, tmdbId: r.tmdbId, firstRequestedAt: r.createdAt, keys: keysFor(r), jellyfinMediaId: r.jellyfinMediaId, seconds: 0, othersSeconds: 0 });
	}
	const titles = [...byTitle.values()];

	// index everyone's views by title key
	const viewsByKey = new Map<string, View[]>();
	for (const v of allViews) {
		let l = viewsByKey.get(v.titleKey);
		if (!l) viewsByKey.set(v.titleKey, (l = []));
		l.push(v);
	}
	const viewers = new Set<string>();
	const goodTaste: RequestTitle[] = [];
	for (const t of titles) {
		const watchers = new Set<string>();
		for (const key of t.keys) {
			for (const v of viewsByKey.get(key) ?? []) {
				if (v.start < t.firstRequestedAt || v.start >= range.rangeEnd) continue;
				t.seconds += v.seconds;
				if (v.userId === userId) continue;
				t.othersSeconds += v.seconds;
				watchers.add(v.userId);
			}
		}
		if (watchers.size) {
			goodTaste.push(t);
			watchers.forEach((w) => viewers.add(w));
		}
	}
	// the slide shows (and plays music for) the most-watched requests
	titles.sort((a, b) => b.seconds - a.seconds || a.firstRequestedAt - b.firstRequestedAt);
	goodTaste.sort((a, b) => b.othersSeconds - a.othersSeconds || a.firstRequestedAt - b.firstRequestedAt);
	return {
		total: titles.length,
		movies: titles.filter((t) => t.mediaType === 'movie').length,
		shows: titles.filter((t) => t.mediaType === 'tv').length,
		titles,
		goodTaste,
		goodTasteViewers: viewers.size
	};
}
