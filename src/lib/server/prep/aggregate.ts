/**
 * Pure aggregation functions. Every function consumes the same cleaned `View[]`
 * (see normalize.ts) so numbers are consistent across slides.
 */
import type { TitleMeta, View } from './model';
import { viewIntervals } from './normalize';
import { forEachLocalHour, localDayNumber, toLocal, weekdayIndex, type Interval } from './time';
import type { ClockPersonaId } from '$shared/report';

export interface Ctx {
	tz: string;
	rangeStart: number;
	rangeEnd: number;
	titles: Map<string, TitleMeta>;
}

// ---------------------------------------------------------------- totals

export interface Totals {
	seconds: number;
	minutes: number;
	movieSeconds: number;
	tvSeconds: number;
	movies: number; // distinct movie titles
	movieViews: number;
	episodes: number; // distinct episodes
	episodePlays: number;
	series: number; // distinct series
	views: number;
	rewatchViews: number;
}

export function totals(views: View[]): Totals {
	let seconds = 0,
		movieSeconds = 0,
		tvSeconds = 0,
		movieViews = 0,
		episodePlays = 0,
		rewatchViews = 0;
	const movies = new Set<string>();
	const episodes = new Set<string>();
	const series = new Set<string>();
	for (const v of views) {
		seconds += v.seconds;
		if (v.rewatch) rewatchViews++;
		if (v.kind === 'movie') {
			movieSeconds += v.seconds;
			movieViews++;
			movies.add(v.titleKey);
		} else {
			tvSeconds += v.seconds;
			episodePlays++;
			episodes.add(v.unitKey);
			series.add(v.titleKey);
		}
	}
	return {
		seconds,
		minutes: Math.round(seconds / 60),
		movieSeconds,
		tvSeconds,
		movies: movies.size,
		movieViews,
		episodes: episodes.size,
		episodePlays,
		series: series.size,
		views: views.length,
		rewatchViews
	};
}

// ---------------------------------------------------------------- rankings

export interface TitleStat {
	titleKey: string;
	kind: 'movie' | 'series';
	seconds: number;
	plays: number; // views (movies) or episode plays (series)
	units: number; // distinct episodes (series) / 1 (movie)
	completedViews: number;
	firstStart: number;
	score: number;
}

export function titleStats(views: View[]): Map<string, TitleStat> {
	const map = new Map<string, TitleStat & { unitSet: Set<string> }>();
	for (const v of views) {
		let s = map.get(v.titleKey);
		if (!s) {
			s = {
				titleKey: v.titleKey,
				kind: v.kind === 'movie' ? 'movie' : 'series',
				seconds: 0,
				plays: 0,
				units: 0,
				completedViews: 0,
				firstStart: v.start,
				score: 0,
				unitSet: new Set()
			};
			map.set(v.titleKey, s);
		}
		s.seconds += v.seconds;
		s.plays++;
		if (v.completed) s.completedViews++;
		s.unitSet.add(v.unitKey);
		s.units = s.unitSet.size;
		s.firstStart = Math.min(s.firstStart, v.start);
	}
	const out = new Map<string, TitleStat>();
	for (const [k, { unitSet: _u, ...rest }] of map) out.set(k, rest);
	return out;
}

/**
 * Weighted ranking: 70% normalized watch time + 30% normalized plays (episode plays for
 * series, views incl. rewatches for movies). Normalization is against the user's max.
 */
export function rankTitles(stats: Iterable<TitleStat>, kind: 'movie' | 'series', limit = 5): TitleStat[] {
	const list = [...stats].filter((s) => s.kind === kind);
	const maxSec = Math.max(1, ...list.map((s) => s.seconds));
	const maxPlays = Math.max(1, ...list.map((s) => s.plays));
	for (const s of list) s.score = 0.7 * (s.seconds / maxSec) + 0.3 * (s.plays / maxPlays);
	return list
		.sort((a, b) => b.score - a.score || b.seconds - a.seconds || a.firstStart - b.firstStart || a.titleKey.localeCompare(b.titleKey))
		.slice(0, limit);
}

// ---------------------------------------------------------------- genres

const GENRE_ALIASES: Record<string, string[]> = {
	'sci-fi & fantasy': ['Science Fiction', 'Fantasy'],
	'action & adventure': ['Action', 'Adventure'],
	'war & politics': ['War', 'Politics'],
	'science-fiction': ['Science Fiction'],
	'sci-fi': ['Science Fiction'],
	'scifi': ['Science Fiction'],
	'suspense': ['Thriller'],
	'kids': ['Family'],
	'children': ['Family'],
	'tv movie': [],
	'talk': ['Talk Show'],
	'film-noir': ['Film Noir'],
	'musical': ['Music']
};

/** Normalize genre labels from Jellyfin/TMDb into one vocabulary. */
export function normalizeGenres(genres: string[]): string[] {
	const out = new Set<string>();
	for (const raw of genres) {
		const g = raw.trim();
		if (!g) continue;
		const alias = GENRE_ALIASES[g.toLowerCase()];
		if (alias) alias.forEach((a) => out.add(a));
		else out.add(g.replace(/\b\w/g, (c) => c.toUpperCase()));
	}
	return [...out];
}

export interface GenreStat {
	name: string;
	seconds: number;
	share: number;
	topTitleKey: string | null;
}

/** Watch time is split evenly across a title's genres so shares sum to 100%. */
export function genreDistribution(views: View[], titles: Map<string, TitleMeta>): GenreStat[] {
	const secs = new Map<string, number>();
	const perTitle = new Map<string, Map<string, number>>();
	let total = 0;
	for (const v of views) {
		const genres = titles.get(v.titleKey)?.genres ?? [];
		if (!genres.length) continue;
		const part = v.seconds / genres.length;
		total += v.seconds;
		for (const g of genres) {
			secs.set(g, (secs.get(g) ?? 0) + part);
			let pt = perTitle.get(g);
			if (!pt) perTitle.set(g, (pt = new Map()));
			pt.set(v.titleKey, (pt.get(v.titleKey) ?? 0) + v.seconds);
		}
	}
	return [...secs.entries()]
		.map(([name, seconds]) => {
			const pt = perTitle.get(name)!;
			const top = [...pt.entries()].sort((a, b) => b[1] - a[1])[0];
			return { name, seconds, share: total ? seconds / total : 0, topTitleKey: top?.[0] ?? null };
		})
		.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

/** Normalized Shannon entropy (0..1) of a distribution. */
export function evenness(shares: number[]): number {
	const p = shares.filter((s) => s > 0);
	if (p.length < 2) return 0;
	const h = -p.reduce((s, x) => s + x * Math.log(x), 0);
	return h / Math.log(p.length);
}

// ---------------------------------------------------------------- actors

export interface ActorStat {
	key: string;
	name: string;
	portrait: import('../artwork').ArtSource | null;
	titleKeys: string[];
	characters: Record<string, string | null>;
	/** 1-based billing position of the actor in each counted title (for admin auditing). */
	billing: Record<string, number>;
	/** Sum of role-prominence weights across counted titles (lead = 1, #5 = 0.5, #9 = 0.33). */
	prominence: number;
	seconds: number;
	bestOrder: number;
}

/** Only an actor's core-cast roles count (top N billed), not ensemble/bit parts. */
export const ACTOR_CAST_DEPTH = 10;

/** Weight of a role by billing position: 1 for the lead, halving by #5. */
export function roleProminence(billing: number): number {
	return 1 / (1 + (billing - 1) / 4);
}

/**
 * A title the user genuinely watched (shared by actor and popularity metrics):
 * a movie with >= 40 min watched or a completed view; a series with >= 2 distinct
 * episodes or >= 60 min watched. A quick sample of something doesn't count.
 */
export function meaningfulTitle(s: TitleStat): boolean {
	return s.kind === 'movie' ? s.seconds >= 40 * 60 || s.completedViews > 0 : s.units >= 2 || s.seconds >= 60 * 60;
}

/**
 * Most-watched actor ("You had a type"):
 *   1. number of DISTINCT titles (movies/series) featuring them — not episode counts;
 *   2. ties: prominence of those roles (lead roles beat ensemble parts);
 *   3. then watch time across those titles, then best billing.
 * Only titles the user genuinely watched (see meaningfulTitle) and only the top
 * `castDepth` billed actors of each title count, so samples and big ensemble credit
 * lists (sketch shows, anthologies) don't decide it.
 */
export function actorRanking(stats: Map<string, TitleStat>, titles: Map<string, TitleMeta>, castDepth = ACTOR_CAST_DEPTH): ActorStat[] {
	const actors = new Map<string, ActorStat>();
	for (const s of stats.values()) {
		if (!meaningfulTitle(s)) continue;
		const meta = titles.get(s.titleKey);
		if (!meta) continue;
		const seen = new Set<string>();
		for (const c of meta.cast.slice(0, castDepth)) {
			if (seen.has(c.key)) continue;
			seen.add(c.key);
			let a = actors.get(c.key);
			if (!a) actors.set(c.key, (a = { key: c.key, name: c.name, portrait: c.portrait, titleKeys: [], characters: {}, billing: {}, prominence: 0, seconds: 0, bestOrder: 999 }));
			a.titleKeys.push(s.titleKey);
			a.characters[s.titleKey] = c.character;
			a.billing[s.titleKey] = c.order + 1;
			a.prominence += roleProminence(c.order + 1);
			a.seconds += s.seconds;
			a.bestOrder = Math.min(a.bestOrder, c.order);
			if (!a.portrait && c.portrait) a.portrait = c.portrait;
		}
	}
	return [...actors.values()].sort(
		(a, b) =>
			b.titleKeys.length - a.titleKeys.length ||
			b.prominence - a.prominence ||
			b.seconds - a.seconds ||
			a.bestOrder - b.bestOrder ||
			a.name.localeCompare(b.name)
	);
}

// ---------------------------------------------------------------- binge

export const BINGE_MAX_GAP_MS = 45 * 60_000;

export interface Binge {
	titleKey: string;
	episodes: number;
	seconds: number;
	start: number;
	end: number;
	units: string[]; // ordered distinct episode unit keys
	labels: string[];
}

/**
 * Continuous TV binges: consecutive watching of the same series where each break between
 * episodes is at most 45 minutes. Returns all chains with >= 2 episodes, best first.
 */
export function binges(views: View[]): Binge[] {
	const events: { titleKey: string; unitKey: string; label: string; iv: Interval }[] = [];
	for (const v of views) {
		if (v.kind !== 'episode') continue;
		const label = v.season != null && v.episode != null ? `S${v.season}E${v.episode}` : '';
		for (const iv of viewIntervals(v)) events.push({ titleKey: v.titleKey, unitKey: v.unitKey, label, iv });
	}
	const bySeries = new Map<string, typeof events>();
	for (const e of events) {
		let l = bySeries.get(e.titleKey);
		if (!l) bySeries.set(e.titleKey, (l = []));
		l.push(e);
	}
	const out: Binge[] = [];
	for (const [titleKey, list] of bySeries) {
		list.sort((a, b) => a.iv.start - b.iv.start);
		let chain: typeof list = [];
		const close = () => {
			if (!chain.length) return;
			const units: string[] = [];
			const labels: string[] = [];
			for (const e of chain)
				if (!units.includes(e.unitKey)) {
					units.push(e.unitKey);
					labels.push(e.label);
				}
			if (units.length >= 2) {
				out.push({
					titleKey,
					episodes: units.length,
					seconds: chain.reduce((s, e) => s + (e.iv.end - e.iv.start) / 1000, 0),
					start: chain[0].iv.start,
					end: Math.max(...chain.map((e) => e.iv.end)),
					units,
					labels
				});
			}
			chain = [];
		};
		let chainEnd = -Infinity;
		for (const e of list) {
			if (chain.length && e.iv.start - chainEnd > BINGE_MAX_GAP_MS) close();
			chain.push(e);
			chainEnd = chain.length === 1 ? e.iv.end : Math.max(chainEnd, e.iv.end);
		}
		close();
	}
	return out.sort((a, b) => b.episodes - a.episodes || b.seconds - a.seconds || a.start - b.start);
}

// ---------------------------------------------------------------- clock

export const CLOCK_PERSONAS: { id: ClockPersonaId; title: string; hours: number[] }[] = [
	{ id: 'early-bird', title: 'The Early Bird', hours: [5, 6, 7, 8] },
	{ id: 'daytime-drifter', title: 'The Daytime Drifter', hours: [9, 10, 11, 12] },
	{ id: 'afternoon-escapist', title: 'The Afternoon Escapist', hours: [13, 14, 15, 16] },
	{ id: 'prime-time', title: 'Prime-Time Royalty', hours: [17, 18, 19, 20] },
	{ id: 'night-owl', title: 'The Night Owl', hours: [21, 22, 23, 0] },
	{ id: 'midnight-gremlin', title: 'The Midnight Gremlin', hours: [1, 2, 3, 4] }
];

export interface DailyAgg {
	seconds: number;
	titles: Map<string, { seconds: number; units: Set<string> }>;
}

export interface TimeBuckets {
	hourly: number[]; // seconds per local hour
	daily: Map<number, DailyAgg>; // day number -> totals
	weekendSeconds: number;
}

export function timeBuckets(views: View[], tz: string): TimeBuckets {
	const hourly = new Array(24).fill(0);
	const daily = new Map<number, DailyAgg>();
	let weekendSeconds = 0;
	for (const v of views) {
		for (const iv of viewIntervals(v)) {
			forEachLocalHour(iv, tz, (day, hour, seconds) => {
				hourly[hour] += seconds;
				let d = daily.get(day);
				if (!d) daily.set(day, (d = { seconds: 0, titles: new Map() }));
				d.seconds += seconds;
				let t = d.titles.get(v.titleKey);
				if (!t) d.titles.set(v.titleKey, (t = { seconds: 0, units: new Set() }));
				t.seconds += seconds;
				t.units.add(v.unitKey);
				const wd = weekdayIndex(day);
				if (wd === 0 || wd === 6) weekendSeconds += seconds;
			});
		}
	}
	return { hourly, daily, weekendSeconds };
}

export function clockPersona(hourly: number[]) {
	const total = hourly.reduce((a, b) => a + b, 0);
	const scored = CLOCK_PERSONAS.map((p) => ({ ...p, seconds: p.hours.reduce((s, h) => s + hourly[h], 0) }));
	scored.sort((a, b) => b.seconds - a.seconds);
	const best = scored[0];
	const peakHour = hourly.indexOf(Math.max(...hourly));
	return { id: best.id, title: best.title, share: total ? best.seconds / total : 0, peakHour, totalSeconds: total };
}

// ---------------------------------------------------------------- days & streaks

export const STREAK_MIN_SECONDS = 10 * 60;

export function busiestDay(daily: Map<number, DailyAgg>) {
	let best: { day: number; agg: DailyAgg } | null = null;
	for (const [day, agg] of daily) if (!best || agg.seconds > best.agg.seconds || (agg.seconds === best.agg.seconds && day < best.day)) best = { day, agg };
	return best;
}

export function longestStreak(daily: Map<number, DailyAgg>, minSeconds = STREAK_MIN_SECONDS) {
	const days = [...daily.entries()].filter(([, a]) => a.seconds >= minSeconds).map(([d]) => d).sort((a, b) => a - b);
	let best = { start: 0, end: -1, length: 0 };
	let runStart = days[0];
	for (let i = 0; i < days.length; i++) {
		if (i > 0 && days[i] !== days[i - 1] + 1) runStart = days[i];
		const length = days[i] - runStart + 1;
		if (length > best.length) best = { start: runStart, end: days[i], length };
	}
	return { ...best, activeDays: days.length };
}

/** Day intensity 0..4 using the user's own active-day quartiles. */
export function heatLevels(daily: Map<number, DailyAgg>, firstDay: number, dayCount: number): number[] {
	const active = [...daily.values()].map((d) => d.seconds).filter((s) => s >= 60).sort((a, b) => a - b);
	const q = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))] ?? 0;
	const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
	const out: number[] = [];
	for (let i = 0; i < dayCount; i++) {
		const s = daily.get(firstDay + i)?.seconds ?? 0;
		out.push(s < 60 ? 0 : s <= q1 ? 1 : s <= q2 ? 2 : s <= q3 ? 3 : 4);
	}
	return out;
}

// ---------------------------------------------------------------- obscurity

/** Titles eligible for popularity comparisons (watched meaningfully, popularity known). */
export function popularityCandidates(stats: Map<string, TitleStat>, titles: Map<string, TitleMeta>) {
	const out: { stat: TitleStat; meta: TitleMeta; popularity: number }[] = [];
	for (const s of stats.values()) {
		const meta = titles.get(s.titleKey);
		if (!meta || meta.popularity == null || !(meta.popularity > 0)) continue;
		if (meaningfulTitle(s)) out.push({ stat: s, meta, popularity: meta.popularity });
	}
	return out.sort((a, b) => a.popularity - b.popularity);
}

// ---------------------------------------------------------------- misc helpers

export function weekendShare(b: TimeBuckets): number {
	const total = b.hourly.reduce((a, x) => a + x, 0);
	return total ? b.weekendSeconds / total : 0;
}

export function localYear(ts: number, tz: string): number {
	return new Date(toLocal(ts, tz)).getUTCFullYear();
}

export { localDayNumber };
