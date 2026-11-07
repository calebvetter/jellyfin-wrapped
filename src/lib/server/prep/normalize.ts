/**
 * Playback cleaning: turns raw session rows into consistent "views".
 *
 * Rules (shared by every slide so metrics agree):
 *  - rows shorter than NOISE_SECONDS are dropped outright;
 *  - durations are capped (runtime x1.5 + 5 min, or a generous default when runtime is unknown);
 *  - overlapping rows of the same unit (duplicate devices/reporting) are unioned;
 *  - resumed sessions merge into one view while the view is incomplete and the gap is
 *    under RESUME_WINDOW (or 2 h when runtime is unknown);
 *  - a view only counts if it is "meaningful" (accidental starts are discarded entirely,
 *    including their watch time);
 *  - a view is completed at >= 80% of runtime; a view of a unit the user already
 *    completed earlier is a rewatch.
 */
import type { PlaybackRecord, View } from './model';
import type { Interval } from './time';

export const NOISE_SECONDS = 15;
export const RESUME_WINDOW_MS = 7 * 86_400_000;
export const UNKNOWN_RUNTIME_RESUME_MS = 2 * 3_600_000;
export const COMPLETION_RATIO = 0.8;
export const MERGE_UNTIL_RATIO = 0.85;
const DEFAULT_CAP = { movie: 5 * 3600, episode: 3 * 3600 } as const;

export function meaningfulThreshold(runtimeSec: number | null): number {
	if (!runtimeSec || runtimeSec <= 0) return 300;
	return Math.min(300, Math.max(60, runtimeSec * 0.4));
}

export function capSeconds(seconds: number, runtimeSec: number | null, kind: 'movie' | 'episode'): number {
	const cap = runtimeSec && runtimeSec > 0 ? runtimeSec * 1.5 + 300 : DEFAULT_CAP[kind];
	return Math.max(0, Math.min(seconds, cap));
}

export interface NormalizeOptions {
	rangeStart: number;
	rangeEnd: number;
}

export function buildViews(records: PlaybackRecord[], opts: NormalizeOptions): View[] {
	const groups = new Map<string, PlaybackRecord[]>();
	for (const r of records) {
		if (!(r.seconds >= NOISE_SECONDS)) continue;
		const k = `${r.userId}\u0000${r.unitKey}`;
		let g = groups.get(k);
		if (!g) groups.set(k, (g = []));
		g.push(r);
	}

	const views: View[] = [];
	for (const group of groups.values()) {
		group.sort((a, b) => a.start - b.start);

		// 1) cap + union overlapping rows into clean segments with watched seconds
		const segs: { start: number; end: number; seconds: number; runtimeSec: number | null }[] = [];
		for (const r of group) {
			const seconds = capSeconds(r.seconds, r.runtimeSec, r.kind);
			let start = r.start;
			let end = r.end;
			if (end - start > seconds * 1000 + 60_000 && seconds < r.seconds) {
				// duration was capped; shrink the interval from the start (end time is the reliable one)
				start = end - seconds * 1000;
			}
			const prev = segs[segs.length - 1];
			if (prev && start < prev.end - 30_000) {
				const extra = Math.max(0, end - prev.end) / 1000;
				prev.end = Math.max(prev.end, end);
				prev.seconds += Math.min(extra, seconds);
				continue;
			}
			segs.push({ start, end: Math.max(end, start), seconds, runtimeSec: r.runtimeSec });
		}

		// 2) merge resumed segments into views
		const first = group[0];
		let current: View | null = null;
		let completedBefore = false;
		const flush = () => {
			if (!current) return;
			if (current.seconds >= meaningfulThreshold(current.runtimeSec)) {
				current.completed = current.runtimeSec ? current.seconds >= current.runtimeSec * COMPLETION_RATIO : false;
				current.rewatch = completedBefore;
				if (current.completed) completedBefore = true;
				views.push(current);
			}
			current = null;
		};
		for (const s of segs) {
			if (current) {
				const view: View = current;
				const gap = s.start - view.end;
				const rt = view.runtimeSec;
				const canResume = rt
					? view.seconds < rt * MERGE_UNTIL_RATIO && gap <= RESUME_WINDOW_MS
					: gap <= UNKNOWN_RUNTIME_RESUME_MS;
				if (canResume) {
					view.segments.push({ start: s.start, end: s.end });
					view.seconds += s.seconds;
					view.end = Math.max(view.end, s.end);
					continue;
				}
				flush();
			}
			current = {
				userId: first.userId,
				kind: first.kind,
				unitKey: first.unitKey,
				titleKey: first.titleKey,
				season: first.season,
				episode: first.episode,
				start: s.start,
				end: s.end,
				seconds: s.seconds,
				segments: [{ start: s.start, end: s.end }],
				runtimeSec: s.runtimeSec,
				completed: false,
				rewatch: false
			};
		}
		flush();
	}

	// 3) restrict to the prepared range (attributed by view start); clip segments to range end
	return views
		.filter((v) => v.start >= opts.rangeStart && v.start < opts.rangeEnd)
		.map((v) => clipView(v, opts.rangeEnd))
		.sort((a, b) => a.start - b.start);
}

function clipView(v: View, rangeEnd: number): View {
	if (v.end <= rangeEnd) return v;
	const segments: Interval[] = v.segments
		.filter((s) => s.start < rangeEnd)
		.map((s) => ({ start: s.start, end: Math.min(s.end, rangeEnd) }));
	return { ...v, segments, end: Math.min(v.end, rangeEnd) };
}

/**
 * Watched-time intervals for clock/day based metrics. Each segment's interval is scaled so
 * its length equals the watched seconds attributed to it (pauses are excluded), keeping
 * hour/day totals consistent with total watch time.
 */
export function viewIntervals(v: View): Interval[] {
	const total = v.segments.reduce((s, x) => s + Math.max(0, x.end - x.start), 0);
	if (total <= 0) return [{ start: v.start, end: v.start + v.seconds * 1000 }];
	const scale = (v.seconds * 1000) / total;
	return v.segments.map((s) => {
		const len = Math.max(0, s.end - s.start) * scale;
		// keep the segment anchored to its end (reliable timestamp), never before its start
		return { start: Math.max(s.start, s.end - len), end: Math.max(s.start, s.end - len) + len };
	});
}
