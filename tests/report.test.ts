import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, _setDbForTests } from '../src/lib/server/db';
import { buildReport } from '../src/lib/server/prep/report';
import { buildViews } from '../src/lib/server/prep/normalize';
import type { PlaybackRecord, TitleMeta } from '../src/lib/server/prep/model';

beforeEach(() => _setDbForTests(openDatabase(':memory:')));

const H = 3_600_000;
const range = { rangeStart: Date.UTC(2026, 0, 1), rangeEnd: Date.UTC(2027, 0, 1) };

function meta(key: string, kind: 'movie' | 'series', genres: string[], cast: string[], popularity: number, year = 2015): TitleMeta {
	return {
		key,
		kind,
		title: key.split(':').pop()!,
		year,
		genres,
		cast: cast.map((name, order) => ({ key: name.toLowerCase(), name, character: null, portrait: null, order })),
		popularity,
		tmdbId: null,
		poster: null,
		backdrop: null,
		seasonEpisodes: kind === 'series' ? { 1: 10 } : null,
		jellyfinIds: [],
		missingFromLibrary: false
	};
}

const titles = new Map<string, TitleMeta>();
for (let i = 0; i < 5; i++) titles.set(`series:s${i}`, meta(`series:s${i}`, 'series', ['Drama', i % 2 ? 'Comedy' : 'Crime'], ['Ann', `Extra${i}`], 5 + i * 20));
for (let i = 0; i < 5; i++) titles.set(`movie:m${i}`, meta(`movie:m${i}`, 'movie', ['Action', i % 2 ? 'Science Fiction' : 'Thriller'], ['Ann', `Cameo${i}`], 1 + i * 40));

let n = 0;
function play(userId: string, titleKey: string, start: number, minutes: number, ep?: number): PlaybackRecord {
	const kind = titleKey.startsWith('series') ? 'episode' : 'movie';
	return {
		id: String(n++),
		userId,
		kind,
		titleKey,
		unitKey: kind === 'episode' ? `${titleKey}:s1e${ep}` : titleKey,
		season: kind === 'episode' ? 1 : null,
		episode: ep ?? null,
		start,
		end: start + minutes * 60_000,
		seconds: minutes * 60,
		runtimeSec: kind === 'episode' ? 1800 : 6000
	};
}

function heavyUser(userId: string) {
	const recs: PlaybackRecord[] = [];
	for (let d = 0; d < 20; d++) {
		const day = Date.UTC(2026, 2, 1 + d, 19);
		for (let e = 0; e < 4; e++) recs.push(play(userId, `series:s${d % 5}`, day + e * 32 * 60_000, 29, d * 4 + e + 1));
		recs.push(play(userId, `movie:m${d % 5}`, day + 3 * H, 98));
	}
	return recs;
}

describe('report builder', () => {
	it('omits users without meaningful viewing', async () => {
		const views = buildViews([play('u1', 'movie:m0', Date.UTC(2026, 1, 1), 20)], range);
		const out = await buildReport({ userId: 'u1', userName: 'U', year: 2026, yearToDate: false, views, ctx: { tz: 'UTC', ...range, titles }, serverPopularity: [], requests: null });
		expect(out.report).toBeNull();
	});

	it('builds the full story for a heavy viewer in canonical order', async () => {
		const views = buildViews(heavyUser('u1'), range);
		const out = await buildReport({ userId: 'u1', userName: 'U', year: 2026, yearToDate: false, views, ctx: { tz: 'UTC', ...range, titles }, serverPopularity: [1, 50, 100, 150], requests: null });
		const kinds = out.report!.slides.map((s) => s.kind);
		expect(kinds[0]).toBe('intro');
		expect(kinds.at(-1)).toBe('summary');
		for (const k of ['total-time', 'top-shows', 'top-movies', 'genres', 'actor', 'binge', 'clock', 'busiest-day', 'streak', 'original']) expect(kinds).toContain(k);
		expect(kinds).not.toContain('requests'); // no Seerr data → slide omitted, not faked
		const actor = out.report!.slides.find((s) => s.kind === 'actor');
		expect(actor?.kind === 'actor' && actor.actor.name).toBe('Ann');
		const streak = out.report!.slides.find((s) => s.kind === 'streak');
		expect(streak?.kind === 'streak' && streak.days).toBe(20);
		const binge = out.report!.slides.find((s) => s.kind === 'binge');
		expect(binge?.kind === 'binge' && binge.episodes).toBe(4);
	});

	it('never leaks other users into a report', async () => {
		const views = buildViews([...heavyUser('me'), ...heavyUser('someone-else')], range);
		const mine = views.filter((v) => v.userId === 'me');
		const out = await buildReport({
			userId: 'me',
			userName: 'Me',
			year: 2026,
			yearToDate: false,
			views: mine,
			ctx: { tz: 'UTC', ...range, titles },
			serverPopularity: [],
			requests: { total: 2, movies: 2, shows: 0, titles: [], goodTasteTitles: 1, goodTasteViewers: 1, goodTasteExamples: [] }
		});
		expect(JSON.stringify(out.report)).not.toContain('someone-else');
		const req = out.report!.slides.find((s) => s.kind === 'requests');
		expect(req && req.kind === 'requests' && req.goodTaste).toEqual({ titles: 1, viewers: 1, examples: [] });
	});
});
