import { describe, expect, it } from 'vitest';
import { buildClockHistogram, localHourly, localizeReport } from '../src/lib/shared/clock';
import { mockReport } from '../src/lib/mock/mockReport';
import { forEachLocalHour } from '../src/lib/server/prep/time';
import type { ClockSlide, SummarySlide } from '../src/lib/shared/report';

const H = 3_600_000;
const M = 60_000;
const yearStart = Date.UTC(2026, 0, 1, 8); // LA midnight

/** Server-side reference: seconds per local hour, exact per hour (handles DST). */
function reference(intervals: { start: number; end: number }[], tz: string) {
	const hourly = new Array(24).fill(0);
	for (const iv of intervals) forEachLocalHour(iv, tz, (_d, h, s) => (hourly[h] += s));
	return hourly;
}

describe('clock histogram', () => {
	// evening sessions spread over the year, across both DST changes
	const intervals = Array.from({ length: 60 }, (_, i) => {
		const start = yearStart + i * 6 * 24 * H + 3 * H + (i % 5) * 37 * M; // ~19:00 LA ± a couple of hours
		return { start, end: start + 95 * M };
	});

	it('re-buckets into the server zone exactly like prep does (outside DST change weeks)', () => {
		const h = buildClockHistogram(intervals, yearStart);
		const total = intervals.reduce((s, iv) => s + (iv.end - iv.start) / 1000, 0);
		expect(h.cells.filter((_, i) => i % 3 === 2).reduce((a, b) => a + b, 0)).toBeCloseTo(total, -1);
		const got = localHourly(h, 'America/Los_Angeles');
		const want = reference(intervals, 'America/Los_Angeles');
		// mid-week offsets can misplace at most the sessions in the two DST-change weeks
		const diff = got.reduce((s, x, i) => s + Math.abs(x - want[i]), 0);
		expect(diff).toBeLessThanOrEqual(2 * 2 * 95 * 60);
	});

	it('follows the viewer zone, including half-hour offsets', () => {
		const iv = { start: Date.UTC(2026, 5, 10, 15, 0), end: Date.UTC(2026, 5, 10, 16, 0) }; // 15:00–16:00Z
		const h = buildClockHistogram([iv], yearStart);
		expect(localHourly(h, 'Asia/Manila')[23]).toBe(3600); // UTC+8 → 23:00
		const kolkata = localHourly(h, 'Asia/Kolkata'); // UTC+5:30 → 20:30–21:30
		expect(kolkata[20]).toBe(1800);
		expect(kolkata[21]).toBe(1800);
		expect(localHourly(h, 'America/Los_Angeles')[8]).toBe(3600); // PDT
	});
});

describe('localizeReport', () => {
	const report = mockReport({});
	const clockOf = (r: typeof report) => r.slides.find((s) => s.kind === 'clock') as ClockSlide;
	const summaryOf = (r: typeof report) => r.slides.find((s) => s.kind === 'summary') as SummarySlide;

	it('leaves the report alone in its own zone or without a zone', () => {
		expect(localizeReport(report, report.timezone)).toBe(report);
		expect(localizeReport(report, null)).toBe(report);
		expect(localizeReport(report, 'Not/AZone')).toBe(report);
	});

	it('shifts the clock and the summary persona for a viewer elsewhere', () => {
		const manila = localizeReport(report, 'Asia/Manila'); // Chicago (UTC−6 in January) + 14 h
		const c = clockOf(manila);
		expect(c.peakHour).toBe((clockOf(report).peakHour + 14) % 24);
		expect(c.hourly.reduce((a, b) => a + b, 0)).toBe(clockOf(report).hourly.reduce((a, b) => a + b, 0));
		expect(summaryOf(manila).clockPersona).toBe(c.personaTitle);
		expect(c.personaTitle).not.toBe(clockOf(report).personaTitle);
	});
});
