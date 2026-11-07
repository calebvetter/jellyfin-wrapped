/**
 * Timezone helpers built on Intl (no dependencies). Offsets are cached per UTC hour,
 * which keeps per-minute bucketing of a whole year cheap.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

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

/** Offset (ms) to add to a UTC timestamp to get local wall-clock time in `tz`. */
export function tzOffsetMs(ts: number, tz: string): number {
	if (tz === 'UTC' || tz === 'Etc/UTC') return 0;
	const hourKey = `${tz}|${Math.floor(ts / 3_600_000)}`;
	const cached = offsetCache.get(hourKey);
	if (cached !== undefined) return cached;
	const parts = formatter(tz).formatToParts(new Date(Math.floor(ts / 3_600_000) * 3_600_000));
	const p: Record<string, number> = {};
	for (const part of parts) if (part.type !== 'literal') p[part.type] = Number(part.value);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	const offset = asUtc - Math.floor(ts / 3_600_000) * 3_600_000;
	if (offsetCache.size > 200_000) offsetCache.clear();
	offsetCache.set(hourKey, offset);
	return offset;
}

/** Local wall-clock time as a "fake UTC" millisecond value (use getUTC* on it). */
export function toLocal(ts: number, tz: string): number {
	return ts + tzOffsetMs(ts, tz);
}

/** Convert a local wall-clock (fake UTC ms) back to a real UTC timestamp. */
export function fromLocal(localMs: number, tz: string): number {
	// Two passes handle DST transitions.
	let ts = localMs - tzOffsetMs(localMs, tz);
	ts = localMs - tzOffsetMs(ts, tz);
	return ts;
}

/** Days since 1970-01-01 of the local calendar date. */
export function localDayNumber(ts: number, tz: string): number {
	return Math.floor(toLocal(ts, tz) / 86_400_000);
}

export function dayNumberToKey(day: number): string {
	return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function keyToDayNumber(key: string): number {
	return Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000);
}

/** Local ISO-like "YYYY-MM-DDTHH:mm" string. */
export function localIso(ts: number, tz: string): string {
	return new Date(toLocal(ts, tz)).toISOString().slice(0, 16);
}

/** UTC timestamp for local midnight of Jan 1 of `year` in `tz`. */
export function yearStart(year: number, tz: string): number {
	return fromLocal(Date.UTC(year, 0, 1), tz);
}

export function weekdayName(dayNumber: number): string {
	return ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'][((dayNumber % 7) + 7) % 7];
}

/** 0 = Sunday ... 6 = Saturday for a day number. */
export function weekdayIndex(dayNumber: number): number {
	return (((dayNumber + 4) % 7) + 7) % 7;
}

export interface Interval {
	start: number; // UTC ms
	end: number; // UTC ms
}

/**
 * Split an interval into local-hour pieces, calling `fn(dayNumber, hour, seconds)`.
 * Uses the offset at each piece start, so DST transitions are handled per hour.
 */
export function forEachLocalHour(iv: Interval, tz: string, fn: (day: number, hour: number, seconds: number) => void) {
	let t = iv.start;
	let guard = 0;
	while (t < iv.end && guard++ < 10_000) {
		const local = toLocal(t, tz);
		const nextLocalHour = (Math.floor(local / 3_600_000) + 1) * 3_600_000;
		const pieceEnd = Math.min(iv.end, t + (nextLocalHour - local));
		const day = Math.floor(local / 86_400_000);
		const hour = new Date(local).getUTCHours();
		fn(day, hour, (pieceEnd - t) / 1000);
		t = pieceEnd;
	}
}
