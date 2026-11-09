/**
 * Time-of-day ("clock") stats that follow the viewer's timezone.
 *
 * Reports are prepared in the server's timezone, but people who live or travel elsewhere
 * should see their viewing clock in their own local time. So the clock slide carries a
 * compact UTC histogram (seconds per UTC half-hour, per week of the year) and the browser
 * re-buckets it into the viewer's local hours (`localizeReport`). Weeks keep daylight-saving
 * changes right to within a week; half-hour cells keep +5:30-style zones right.
 */
import type { ClockPersonaId, ClockSlide, WrappedReport } from './report';

export const CLOCK_PERSONAS: { id: ClockPersonaId; title: string; hours: number[] }[] = [
	{ id: 'early-bird', title: 'The Early Bird', hours: [5, 6, 7, 8] },
	{ id: 'daytime-drifter', title: 'The Daytime Drifter', hours: [9, 10, 11, 12] },
	{ id: 'afternoon-escapist', title: 'The Afternoon Escapist', hours: [13, 14, 15, 16] },
	{ id: 'prime-time', title: 'Prime-Time Royalty', hours: [17, 18, 19, 20] },
	{ id: 'night-owl', title: 'The Night Owl', hours: [21, 22, 23, 0] },
	{ id: 'midnight-gremlin', title: 'The Midnight Gremlin', hours: [1, 2, 3, 4] }
];

/** Persona = the 4-hour window with the most watching. Works on seconds or minutes. */
export function clockPersona(hourly: number[]) {
	const total = hourly.reduce((a, b) => a + b, 0);
	const scored = CLOCK_PERSONAS.map((p) => ({ ...p, seconds: p.hours.reduce((s, h) => s + hourly[h], 0) }));
	scored.sort((a, b) => b.seconds - a.seconds);
	const best = scored[0];
	const peakHour = hourly.indexOf(Math.max(...hourly));
	return { id: best.id, title: best.title, share: total ? best.seconds / total : 0, peakHour, totalSeconds: total };
}

// ---------------------------------------------------------------- timezone offsets

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
	let f = fmtCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		fmtCache.set(tz, f);
	}
	return f;
}

/** Offset (ms) to add to a UTC timestamp (whole minutes) to get wall-clock time in `tz`. */
export function utcOffsetMs(ts: number, tz: string): number {
	if (tz === 'UTC' || tz === 'Etc/UTC') return 0;
	const at = Math.floor(ts / 60_000) * 60_000;
	const p: Record<string, number> = {};
	for (const part of formatter(tz).formatToParts(new Date(at))) if (part.type !== 'literal') p[part.type] = Number(part.value);
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at;
}

/** True if the browser/runtime knows this IANA zone. */
export function isValidTimezone(tz: string): boolean {
	try {
		formatter(tz);
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------- UTC histogram

export const HALF_HOUR = 1_800_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/**
 * Viewing seconds by UTC time: `cells` is a flat list of [week, halfHour, seconds] triples,
 * where week counts from `base` (UTC midnight on or before the range start) and halfHour is
 * 0–47 within the UTC day. Only non-empty cells are stored.
 */
export interface ClockHistogram {
	base: number;
	cells: number[];
}

/** Build a histogram from UTC intervals (ms). */
export function buildClockHistogram(intervals: Iterable<{ start: number; end: number }>, rangeStart: number): ClockHistogram {
	const base = Math.floor(rangeStart / DAY) * DAY;
	const acc = new Map<number, number>(); // week * 48 + halfHour -> seconds
	for (const iv of intervals) {
		let t = Math.max(iv.start, base);
		let guard = 0;
		while (t < iv.end && guard++ < 100_000) {
			const pieceEnd = Math.min(iv.end, (Math.floor(t / HALF_HOUR) + 1) * HALF_HOUR);
			const week = Math.floor((t - base) / WEEK);
			const half = Math.floor(((t - base) % DAY) / HALF_HOUR);
			const k = week * 48 + half;
			acc.set(k, (acc.get(k) ?? 0) + (pieceEnd - t) / 1000);
			t = pieceEnd;
		}
	}
	const cells: number[] = [];
	for (const k of [...acc.keys()].sort((a, b) => a - b)) {
		const s = Math.round(acc.get(k)!);
		if (s > 0) cells.push(Math.floor(k / 48), k % 48, s);
	}
	return { base, cells };
}

/** Seconds per local hour (0–23) in `tz`, using each week's mid-week UTC offset. */
export function localHourly(h: ClockHistogram, tz: string): number[] {
	const hourly = new Array(24).fill(0);
	const offsets = new Map<number, number>();
	for (let i = 0; i + 2 < h.cells.length; i += 3) {
		const [week, half, seconds] = [h.cells[i], h.cells[i + 1], h.cells[i + 2]];
		let off = offsets.get(week);
		if (off === undefined) offsets.set(week, (off = utcOffsetMs(h.base + week * WEEK + WEEK / 2, tz)));
		const minuteOfDay = (((half * 30 + off / 60_000) % 1440) + 1440) % 1440;
		hourly[Math.floor(minuteOfDay / 60)] += seconds;
	}
	return hourly;
}

/** The clock slide re-bucketed into `tz`. */
export function localizeClock(slide: ClockSlide, tz: string): ClockSlide {
	if (!slide.utc) return slide;
	const hourly = localHourly(slide.utc, tz);
	const c = clockPersona(hourly);
	return { ...slide, hourly: hourly.map((s) => Math.round(s / 60)), persona: c.id, personaTitle: c.title, windowShare: c.share, peakHour: c.peakHour };
}

/**
 * The report as seen from the viewer's timezone: the clock slide and the summary's
 * "prime viewing" tile follow `tz`. Unchanged when `tz` is the report's own zone, unknown,
 * or the report predates the UTC histogram.
 */
export function localizeReport(report: WrappedReport, tz: string | null | undefined): WrappedReport {
	if (!tz || tz === report.timezone || !isValidTimezone(tz)) return report;
	const clock = report.slides.find((s): s is ClockSlide => s.kind === 'clock');
	if (!clock?.utc) return report;
	const local = localizeClock(clock, tz);
	return {
		...report,
		slides: report.slides.map((s) => (s === clock ? local : s.kind === 'summary' && s.clockPersona ? { ...s, clockPersona: local.personaTitle } : s))
	};
}

/** The viewer's IANA timezone, or null if the runtime can't tell. */
export function viewerTimezone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
}
