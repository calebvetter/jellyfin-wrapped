import { describe, expect, it } from 'vitest';
import { buildViews, meaningfulThreshold, viewIntervals } from '../src/lib/server/prep/normalize';
import {
	binges,
	busiestDay,
	clockPersona,
	genreDistribution,
	longestStreak,
	normalizeGenres,
	rankTitles,
	timeBuckets,
	titleStats,
	totals,
	actorRanking,
	evenness
} from '../src/lib/server/prep/aggregate';
import { choosePersonality, type PersonalityMetrics } from '../src/lib/server/prep/personality';
import { localDayNumber, tzOffsetMs, yearStart, forEachLocalHour } from '../src/lib/server/prep/time';
import type { PlaybackRecord, TitleMeta } from '../src/lib/server/prep/model';

const H = 3_600_000;
const M = 60_000;
const T0 = Date.UTC(2026, 2, 10, 18, 0); // 2026-03-10 18:00Z
const range = { rangeStart: Date.UTC(2026, 0, 1), rangeEnd: Date.UTC(2027, 0, 1) };

let seq = 0;
function rec(p: Partial<PlaybackRecord> & { start: number; minutes: number }): PlaybackRecord {
	const seconds = p.minutes * 60;
	return {
		id: String(seq++),
		userId: p.userId ?? 'u1',
		kind: p.kind ?? 'movie',
		unitKey: p.unitKey ?? 'movie:a',
		titleKey: p.titleKey ?? p.unitKey ?? 'movie:a',
		season: p.season ?? null,
		episode: p.episode ?? null,
		start: p.start,
		end: p.end ?? p.start + seconds * 1000,
		seconds: p.seconds ?? seconds,
		runtimeSec: p.runtimeSec === undefined ? 7200 : p.runtimeSec
	};
}

function ep(series: string, n: number, start: number, minutes = 25, runtime = 1500) {
	return rec({
		kind: 'episode',
		titleKey: `series:${series}`,
		unitKey: `series:${series}:s1e${n}`,
		season: 1,
		episode: n,
		start,
		minutes,
		runtimeSec: runtime
	});
}

describe('normalize', () => {
	it('drops accidental starts entirely', () => {
		const views = buildViews([rec({ start: T0, minutes: 2 })], range);
		expect(views).toHaveLength(0);
		expect(meaningfulThreshold(7200)).toBe(300);
		expect(meaningfulThreshold(300)).toBe(120); // short content: 40% of runtime
	});

	it('merges a movie resumed the next day into one view', () => {
		const views = buildViews([rec({ start: T0, minutes: 60 }), rec({ start: T0 + 20 * H, minutes: 55 })], range);
		expect(views).toHaveLength(1);
		expect(views[0].seconds).toBe(115 * 60);
		expect(views[0].completed).toBe(true);
		expect(views[0].segments).toHaveLength(2);
	});

	it('counts a rewatch after completion as a second view', () => {
		const views = buildViews([rec({ start: T0, minutes: 115 }), rec({ start: T0 + 30 * 24 * H, minutes: 110 })], range);
		expect(views).toHaveLength(2);
		expect(views[0].rewatch).toBe(false);
		expect(views[1].rewatch).toBe(true);
	});

	it('unions overlapping duplicate rows instead of double counting', () => {
		const views = buildViews([rec({ start: T0, minutes: 60 }), rec({ start: T0 + 10 * M, minutes: 60 })], range);
		expect(views).toHaveLength(1);
		expect(views[0].seconds).toBe(70 * 60);
	});

	it('caps absurd durations relative to runtime', () => {
		const views = buildViews([rec({ start: T0, minutes: 600, runtimeSec: 1500, kind: 'episode', unitKey: 'series:x:s1e1' })], range);
		expect(views[0].seconds).toBe(1500 * 1.5 + 300);
	});

	it('restricts views to the prepared range', () => {
		const views = buildViews([rec({ start: Date.UTC(2025, 11, 31, 10), minutes: 100 })], range);
		expect(views).toHaveLength(0);
	});

	it('keeps interval length equal to watched time', () => {
		const [v] = buildViews([rec({ start: T0, minutes: 90, end: T0 + 120 * M })], range); // 30 min paused
		const ivs = viewIntervals(v);
		expect(ivs.reduce((s, i) => s + (i.end - i.start), 0)).toBe(90 * M);
		expect(ivs[0].end).toBe(T0 + 120 * M);
	});
});

describe('rankings', () => {
	it('weights watch time 70% and plays 30%', () => {
		const views = buildViews(
			[
				// long show: few long episodes
				...[0, 1].map((i) => ep('long', i + 1, T0 + i * H, 60, 3600)),
				// short show: many short episodes, slightly less total time
				...[0, 1, 2, 3, 4].map((i) => ep('short', i + 1, T0 + 5 * H + i * 30 * M, 22, 1320))
			],
			range
		);
		const stats = titleStats(views);
		const ranked = rankTitles(stats.values(), 'series');
		// long: 120 min, 2 plays -> 0.7*1 + 0.3*0.4 = 0.82 ; short: 110 min, 5 plays -> 0.7*0.9167 + 0.3 = 0.9417
		expect(ranked.map((r) => r.titleKey)).toEqual(['series:short', 'series:long']);
		expect(ranked[0].score).toBeCloseTo(0.7 * (110 / 120) + 0.3, 4);
	});

	it('counts movie rewatches as plays', () => {
		const views = buildViews(
			[
				rec({ start: T0, minutes: 115, unitKey: 'movie:a' }),
				rec({ start: T0 + 40 * 24 * H, minutes: 115, unitKey: 'movie:a' }),
				rec({ start: T0 + 2 * H, minutes: 118, unitKey: 'movie:b' })
			],
			range
		);
		const ranked = rankTitles(titleStats(views).values(), 'movie');
		expect(ranked[0].titleKey).toBe('movie:a');
		expect(ranked[0].plays).toBe(2);
		expect(totals(views).rewatchViews).toBe(1);
	});
});

describe('binge', () => {
	it('allows breaks up to 45 minutes and splits on longer ones', () => {
		const views = buildViews(
			[
				ep('s', 1, T0, 25),
				ep('s', 2, T0 + 25 * M + 40 * M, 25), // 40 min break: same binge
				ep('s', 3, T0 + 90 * M + 44 * M, 25), // 44 min break: same binge
				ep('s', 4, T0 + 10 * H, 25), // new chain
				ep('s', 5, T0 + 10 * H + 26 * M, 25)
			],
			range
		);
		const b = binges(views);
		expect(b[0].episodes).toBe(3);
		expect(b[0].labels).toEqual(['S1E1', 'S1E2', 'S1E3']);
		expect(b[1].episodes).toBe(2);
	});
});

describe('time buckets', () => {
	it('respects the configured timezone and DST', () => {
		expect(tzOffsetMs(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-5 * H);
		expect(tzOffsetMs(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-4 * H);
		expect(yearStart(2026, 'America/New_York')).toBe(Date.UTC(2026, 0, 1, 5));
		// 03:30Z on Mar 11 is 23:30 local on Mar 10 in New York (EDT after Mar 8 2026)
		const ts = Date.UTC(2026, 2, 11, 3, 30);
		expect(localDayNumber(ts, 'America/New_York')).toBe(Math.floor(Date.UTC(2026, 2, 10) / 86_400_000));
	});

	it('splits viewing across local hours and days', () => {
		const pieces: [number, number, number][] = [];
		forEachLocalHour({ start: Date.UTC(2026, 2, 10, 23, 30), end: Date.UTC(2026, 2, 11, 1, 0) }, 'UTC', (d, h, s) => pieces.push([d, h, s]));
		expect(pieces.map((p) => [p[1], p[2]])).toEqual([
			[23, 1800],
			[0, 3600]
		]);
	});

	it('assigns the night owl persona for 9pm-1am viewing', () => {
		const views = buildViews([rec({ start: Date.UTC(2026, 2, 10, 21, 30), minutes: 110 })], range);
		const b = timeBuckets(views, 'UTC');
		const p = clockPersona(b.hourly);
		expect(p.id).toBe('night-owl');
		expect(Math.round(b.hourly.reduce((a, x) => a + x, 0))).toBe(110 * 60);
	});

	it('finds the busiest day and longest streak', () => {
		const day = 24 * H;
		const views = buildViews(
			[
				rec({ start: T0, minutes: 30, unitKey: 'movie:a', runtimeSec: null }),
				rec({ start: T0 + day, minutes: 200, unitKey: 'movie:b', runtimeSec: null }),
				rec({ start: T0 + 2 * day, minutes: 12, unitKey: 'movie:c', runtimeSec: null }),
				rec({ start: T0 + 3 * day, minutes: 6, unitKey: 'movie:d', runtimeSec: null }), // below meaningful -> dropped
				rec({ start: T0 + 10 * day, minutes: 60, unitKey: 'movie:e', runtimeSec: null })
			],
			range
		);
		const b = timeBuckets(views, 'UTC');
		const busy = busiestDay(b.daily)!;
		expect(Math.round(busy.agg.seconds / 60)).toBe(200);
		const s = longestStreak(b.daily);
		expect(s.length).toBe(3);
		expect(s.activeDays).toBe(4);
	});
});

describe('genres & actors', () => {
	const titles = new Map<string, TitleMeta>();
	const meta = (key: string, genres: string[], cast: string[]): TitleMeta => ({
		key,
		kind: key.startsWith('movie') ? 'movie' : 'series',
		title: key,
		year: 2020,
		genres,
		cast: cast.map((name, order) => ({ key: name.toLowerCase(), name, character: null, portrait: null, order })),
		popularity: 10,
		tmdbId: null,
		poster: null,
		backdrop: null,
		seasonEpisodes: null,
		jellyfinIds: [],
		missingFromLibrary: false
	});
	titles.set('movie:a', meta('movie:a', ['Action', 'Comedy'], ['Ann', 'Bob']));
	titles.set('movie:b', meta('movie:b', ['Action'], ['Ann']));
	titles.set('series:s', meta('series:s', ['Drama'], ['Bob', 'Cat']));

	it('splits genre time evenly and normalizes aliases', () => {
		expect(normalizeGenres(['Sci-Fi & Fantasy', 'drama'])).toEqual(['Science Fiction', 'Fantasy', 'Drama']);
		const views = buildViews([rec({ start: T0, minutes: 100, unitKey: 'movie:a' }), rec({ start: T0 + 3 * H, minutes: 100, unitKey: 'movie:b' })], range);
		const g = genreDistribution(views, titles);
		expect(g[0].name).toBe('Action');
		expect(g[0].share).toBeCloseTo(0.75);
		expect(g.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
		expect(evenness([0.5, 0.5])).toBeCloseTo(1);
	});

	it('ranks actors by distinct titles, not episode counts', () => {
		const views = buildViews(
			[
				rec({ start: T0, minutes: 100, unitKey: 'movie:a' }),
				rec({ start: T0 + 3 * H, minutes: 100, unitKey: 'movie:b' }),
				...Array.from({ length: 20 }, (_, i) => ep('s', i + 1, T0 + 24 * H + i * 30 * M))
			],
			titles.size ? range : range
		);
		const ranking = actorRanking(titleStats(views), titles);
		// Bob: movie:a (#2) + series:s (#1), 600 min; Ann: movie:a (#1) + movie:b (#1), 200 min.
		// Tie on titles -> role prominence decides before watch time: Ann leads both.
		expect(ranking[0].name).toBe('Ann');
		expect(ranking[0].titleKeys).toHaveLength(2);
		expect(ranking[1].name).toBe('Bob');
		expect(ranking.find((a) => a.name === 'Cat')!.titleKeys).toHaveLength(1);
	});

	it('ignores deep-billed ensemble roles', () => {
		const cast = Array.from({ length: 14 }, (_, i) => `Ens${i}`).concat('Deep');
		titles.set('series:sketch', meta('series:sketch', ['Comedy'], cast));
		titles.set('movie:bit', meta('movie:bit', ['Comedy'], [...cast.slice(0, 12), 'Deep']));
		const views = buildViews([...Array.from({ length: 10 }, (_, i) => ep('sketch', i + 1, T0 + i * 30 * M)), rec({ start: T0 + 8 * H, minutes: 100, unitKey: 'movie:bit' })], range);
		const ranking = actorRanking(titleStats(views), titles);
		expect(ranking.find((a) => a.name === 'Deep')).toBeUndefined(); // billed #15 and #13
		expect(ranking.find((a) => a.name === 'Ens0')?.titleKeys).toHaveLength(2);
	});

	it('ignores titles that were only sampled', () => {
		titles.set('series:sample', meta('series:sample', ['Drama'], ['Dee'], ));
		titles.set('movie:sample', meta('movie:sample', ['Drama'], ['Dee']));
		const views = buildViews(
			[
				ep('sample', 1, T0, 25), // one episode of a series: not "genuinely watched"
				rec({ start: T0 + 3 * H, minutes: 30, unitKey: 'movie:sample' }), // 30 min of a 2 h movie
				rec({ start: T0 + 6 * H, minutes: 100, unitKey: 'movie:a' })
			],
			range
		);
		const ranking = actorRanking(titleStats(views), titles);
		expect(ranking.find((a) => a.name === 'Dee')).toBeUndefined();
		expect(ranking.find((a) => a.name === 'Ann')?.billing['movie:a']).toBe(1);
	});
});

describe('personality', () => {
	const base: PersonalityMetrics = {
		totalHours: 100,
		tvShare: 0.5,
		movieShare: 0.5,
		movies: 5,
		series: 5,
		episodes: 40,
		views: 50,
		bingeCount: 1,
		longestBinge: 3,
		rewatchViews: 0,
		rewatchedTitles: 0,
		genreCount: 4,
		genreEvenness: 0.5,
		topSeriesName: 'Show',
		topSeriesShareOfTv: 0.3,
		topSeriesEpisodes: 10,
		popularityKnownShare: 1,
		obscureShare: 0.05,
		recentPopularShare: 0.1,
		oldShare: 0.1,
		medianReleaseYear: 2015,
		weekendShare: 0.3,
		moviesStarted: 5,
		moviesCompleted: 2,
		seasonsStarted: 5,
		seasonsCompleted: 1,
		sampledSeries: 1,
		requests: 0,
		goodTasteTitles: 0
	};

	it('picks the strongest qualifying personality', () => {
		const r = choosePersonality({ ...base, tvShare: 0.85, movieShare: 0.15, bingeCount: 12, longestBinge: 9 });
		expect(r?.primary.id).toBe('serial-binger');
		expect(r?.primary.explanation).toContain('12');
	});

	it('detects weekend warriors and tastemakers', () => {
		expect(choosePersonality({ ...base, weekendShare: 0.7 })?.primary.id).toBe('weekend-warrior');
		expect(choosePersonality({ ...base, requests: 6, goodTasteTitles: 6 })?.primary.id).toBe('tastemaker');
	});

	it('returns null without enough viewing', () => {
		expect(choosePersonality({ ...base, totalHours: 1 })).toBeNull();
	});
});
