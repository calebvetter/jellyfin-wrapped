import { describe, expect, it } from 'vitest';
import { preparationRange } from '../src/lib/server/prep/runner';
import { restrictToRange } from '../src/lib/server/prep/normalize';
import { canonicalTimezone } from '../src/lib/shared/clock';
import type { View } from '../src/lib/server/prep/model';

const H = 3_600_000;

describe('per-user timezones', () => {
	it('canonicalizes zone names and rejects unknown ones', () => {
		expect(canonicalTimezone('america/los_angeles')).toBe('America/Los_Angeles');
		expect(canonicalTimezone(' Asia/Manila ')).toBe('Asia/Manila');
		expect(canonicalTimezone('Mars/Olympus')).toBeNull();
	});

	it('gives each zone its own year', () => {
		const now = Date.UTC(2027, 5, 1);
		const la = preparationRange(2026, now, 'America/Los_Angeles');
		const manila = preparationRange(2026, now, 'Asia/Manila');
		expect(la.rangeStart).toBe(Date.UTC(2026, 0, 1, 8)); // midnight PST
		expect(manila.rangeStart).toBe(Date.UTC(2025, 11, 31, 16)); // midnight UTC+8
		expect(la.yearToDate).toBe(false);
		// the same moment is still 2026 in LA but already 2027 in Manila
		const nye = Date.UTC(2027, 0, 1, 2); // Dec 31 18:00 LA, Jan 1 10:00 Manila
		expect(preparationRange(2026, nye, 'America/Los_Angeles')).toMatchObject({ yearToDate: true, rangeEnd: nye });
		expect(preparationRange(2026, nye, 'Asia/Manila').yearToDate).toBe(false);
	});

	it('trims a run-wide view list to one user’s year', () => {
		const view = (start: number, hours = 1) => ({ start, end: start + hours * H, seconds: hours * 3600, segments: [{ start, end: start + hours * H }] }) as unknown as View;
		const manila = preparationRange(2026, Date.UTC(2027, 5, 1), 'Asia/Manila');
		const views = [view(Date.UTC(2025, 11, 31, 18)), view(Date.UTC(2025, 11, 31, 12)), view(Date.UTC(2026, 11, 31, 15), 2)];
		const kept = restrictToRange(views, manila);
		expect(kept.map((v) => v.start)).toEqual([Date.UTC(2025, 11, 31, 18), Date.UTC(2026, 11, 31, 15)]); // 02:00 Jan 1 in, 20:00 Dec 31 out
		expect(kept[1].end).toBe(manila.rangeEnd); // clipped at Manila's New Year
	});
});
