/** Formatting helpers for slide copy. */

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function plural(n: number, one: string, many = `${one}s`) {
	return `${fmt(n)} ${n === 1 ? one : many}`;
}

export function hoursMinutes(minutes: number) {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (!h) return `${m}m`;
	return m ? `${h}h ${m}m` : `${h}h`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "2026-03-14" → { month: 'March', day: 14, year: 2026 } (no timezone shifting: already local). */
export function parseDay(key: string) {
	const [y, m, d] = key.split('-').map(Number);
	return { year: y, month: MONTHS[m - 1], monthShort: MONTHS_SHORT[m - 1], monthIndex: m - 1, day: d };
}

export function prettyDate(key: string, withYear = false) {
	const p = parseDay(key);
	return `${p.month} ${p.day}${withYear ? `, ${p.year}` : ''}`;
}

export function shortDate(key: string) {
	const p = parseDay(key);
	return `${p.monthShort} ${p.day}`;
}

/** "2026-03-14T19:05" → "7:05 PM" */
export function clockTime(localIso: string) {
	const [hh, mm] = localIso.slice(11, 16).split(':').map(Number);
	const h12 = hh % 12 || 12;
	return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export function hourLabel(h: number) {
	if (h === 0) return '12 AM';
	if (h === 12) return '12 PM';
	return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function pct(x: number) {
	return `${Math.round(x * 100)}%`;
}

/** Deterministic pseudo-random in [0,1) from a string (for stable playful rotations). */
export function seeded(seed: string) {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return ((h ^= h >>> 16) >>> 0) / 4294967296;
	};
}

/** A real-world comparison for a watch time (all facts, no invented stats). */
export function timeComparison(hours: number): string | null {
	const days = hours / 24;
	if (days >= 6) {
		const trips = days / 6; // Apollo-era Earth→Moon→Earth ≈ 6 days
		return `That's enough time to fly to the Moon and back ${trips >= 2 ? `${Math.floor(trips)} times` : 'once'}.`;
	}
	if (hours >= 22) return `That's longer than ${Math.floor(hours / 22) === 1 ? 'a non-stop flight from London to Sydney' : `${Math.floor(hours / 22)} non-stop flights from London to Sydney`}.`;
	if (hours >= 4) return `That's ${Math.floor(hours / 2)} world-record marathons, back to back.`;
	return null;
}
