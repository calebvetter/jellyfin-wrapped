/**
 * Builds one user's ready-to-play WrappedReport (+ full statistics for admins) from
 * cleaned views. Slides without sufficient data are omitted, never faked.
 */
import { ensureArt } from '../artwork';
import type { TitleMeta, View } from './model';
import {
	actorRanking,
	binges,
	busiestDay,
	clockPersona,
	evenness,
	genreDistribution,
	heatLevels,
	longestStreak,
	popularityCandidates,
	rankTitles,
	timeBuckets,
	titleStats,
	totals,
	weekendShare,
	type Ctx
} from './aggregate';
import { choosePersonality, PERSONALITY_NAMES, scorePersonalities, type PersonalityMetrics } from './personality';
import { dayNumberToKey, localDayNumber, localIso, weekdayName } from './time';
import {
	REPORT_VERSION,
	type RankedTitle,
	type Slide,
	type TitleRef,
	type WrappedReport,
	type RequestsSlide
} from '$shared/report';

export const MIN_REPORT_MINUTES = 30;
export const OBSCURE_POPULARITY = 8;
export const POPULAR_POPULARITY = 25;

export interface UserRequestSummary {
	total: number;
	movies: number;
	shows: number;
	titles: { kind: 'movie' | 'series'; meta: TitleMeta | null; posterTitle: TitleRef | null }[];
	goodTasteTitles: number;
	goodTasteViewers: number;
	goodTasteExamples: TitleRef[];
}

export interface BuildInput {
	userId: string;
	userName: string;
	year: number;
	yearToDate: boolean;
	views: View[];
	ctx: Ctx;
	/** Popularity of every title watched on the server (anonymous; for percentile copy). */
	serverPopularity: number[];
	requests: UserRequestSummary | null;
}

export interface BuildOutput {
	report: WrappedReport | null;
	stats: Record<string, unknown>;
	minutes: number;
}

export async function titleRef(meta: TitleMeta | undefined, key: string, withBackdrop = false): Promise<TitleRef> {
	return {
		key,
		kind: meta?.kind ?? (key.startsWith('series') ? 'series' : 'movie'),
		title: meta?.title ?? 'Unknown title',
		year: meta?.year ?? null,
		poster: await ensureArt(meta?.poster),
		backdrop: withBackdrop ? await ensureArt(meta?.backdrop) : null
	};
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function weightedMedian(pairs: [number, number][]): number | null {
	const sorted = pairs.filter(([, w]) => w > 0).sort((a, b) => a[0] - b[0]);
	const total = sorted.reduce((s, [, w]) => s + w, 0);
	let acc = 0;
	for (const [v, w] of sorted) {
		acc += w;
		if (acc >= total / 2) return v;
	}
	return null;
}

export async function buildReport(input: BuildInput): Promise<BuildOutput> {
	const { views, ctx, year } = input;
	const titles = ctx.titles;
	const t = totals(views);
	const stats: Record<string, unknown> = { totals: t };
	if (t.minutes < MIN_REPORT_MINUTES) {
		return { report: null, stats: { ...stats, reason: `Less than ${MIN_REPORT_MINUTES} minutes of meaningful viewing` }, minutes: t.minutes };
	}

	const tStats = titleStats(views);
	const buckets = timeBuckets(views, ctx.tz);
	const slides: Slide[] = [];
	const ref = (key: string, backdrop = false) => titleRef(titles.get(key), key, backdrop);

	// ---- rankings
	const topShows = rankTitles(tStats.values(), 'series');
	const topMovies = rankTitles(tStats.values(), 'movie');
	const ranked = async (list: typeof topShows): Promise<RankedTitle[]> =>
		Promise.all(
			list.map(async (s, i) => ({
				...(await ref(s.titleKey, i === 0)),
				rank: i + 1,
				minutes: Math.round(s.seconds / 60),
				plays: s.plays,
				episodes: s.kind === 'series' ? s.units : undefined,
				score: Math.round(s.score * 1000) / 1000
			}))
		);
	const topShowRefs = await ranked(topShows);
	const topMovieRefs = await ranked(topMovies);
	stats.topShows = topShowRefs;
	stats.topMovies = topMovieRefs;

	// ---- intro & totals
	const collage = [...topShowRefs, ...topMovieRefs].map((r) => r.poster).filter((p): p is string => Boolean(p));
	slides.push({ kind: 'intro', posters: collage.slice(0, 10) });
	const streak = longestStreak(buckets.daily);
	const activeDays = [...buckets.daily.values()].filter((d) => d.seconds >= 60).length;
	slides.push({
		kind: 'total-time',
		minutes: t.minutes,
		hours: Math.round(t.seconds / 3600),
		days: round1(t.seconds / 86_400),
		movies: t.movies,
		episodes: t.episodes,
		series: t.series,
		activeDays
	});

	if (topShowRefs.length >= 3) slides.push({ kind: 'top-shows', items: topShowRefs });
	if (topMovieRefs.length >= 3) slides.push({ kind: 'top-movies', items: topMovieRefs, rewatches: views.filter((v) => v.kind === 'movie' && v.rewatch).length });

	// ---- genres
	const genres = genreDistribution(views, titles);
	stats.genres = genres.map((g) => ({ name: g.name, minutes: Math.round(g.seconds / 60), share: round1(g.share * 100) / 100 }));
	const genreSeconds = genres.reduce((s, g) => s + g.seconds, 0);
	if (genres.length >= 3 && genreSeconds >= 2 * 3600) {
		const top = genres.slice(0, 7).map((g) => ({ name: g.name, minutes: Math.round(g.seconds / 60), share: g.share }));
		const rest = genres.slice(7);
		if (rest.length) {
			const sec = rest.reduce((s, g) => s + g.seconds, 0);
			top.push({ name: 'Everything else', minutes: Math.round(sec / 60), share: rest.reduce((s, g) => s + g.share, 0) });
		}
		slides.push({
			kind: 'genres',
			genres: top,
			dominant: { ...top[0], title: genres[0].topTitleKey ? await ref(genres[0].topTitleKey) : null },
			totalGenres: genres.length
		});
	}

	// ---- actor
	const actors = actorRanking(tStats, titles);
	// Full breakdown for admins: which titles made each actor count, their role and billing.
	stats.actors = actors.slice(0, 10).map((a) => ({
		name: a.name,
		titles: a.titleKeys.length,
		prominence: Math.round(a.prominence * 100) / 100,
		minutes: Math.round(a.seconds / 60),
		breakdown: [...a.titleKeys]
			.sort((x, y) => (tStats.get(y)?.seconds ?? 0) - (tStats.get(x)?.seconds ?? 0))
			.map((k) => ({
				title: titles.get(k)?.title ?? k,
				kind: titles.get(k)?.kind ?? null,
				minutes: Math.round((tStats.get(k)?.seconds ?? 0) / 60),
				episodes: tStats.get(k)?.kind === 'series' ? tStats.get(k)?.units : undefined,
				character: a.characters[k] ?? null,
				billing: a.billing[k] ?? null
			}))
	}));
	const topActor = actors[0];
	if (topActor && topActor.titleKeys.length >= 2) {
		const ordered = [...topActor.titleKeys].sort((a, b) => (tStats.get(b)?.seconds ?? 0) - (tStats.get(a)?.seconds ?? 0));
		slides.push({
			kind: 'actor',
			actor: { name: topActor.name, portrait: await ensureArt(topActor.portrait) },
			titleCount: topActor.titleKeys.length,
			minutes: Math.round(topActor.seconds / 60),
			titles: await Promise.all(ordered.slice(0, 6).map(async (k) => ({ ...(await ref(k)), character: topActor.characters[k] ?? null }))),
			runnersUp: await Promise.all(
				actors
					.slice(1, 4)
					.filter((a) => a.titleKeys.length >= 2)
					.map(async (a) => ({ name: a.name, portrait: await ensureArt(a.portrait), titleCount: a.titleKeys.length }))
			)
		});
	}

	// ---- binge
	const allBinges = binges(views);
	const bigBinges = allBinges.filter((b) => b.episodes >= 3);
	const best = allBinges[0];
	stats.binges = allBinges.slice(0, 5).map((b) => ({ title: titles.get(b.titleKey)?.title, episodes: b.episodes, minutes: Math.round(b.seconds / 60), start: localIso(b.start, ctx.tz) }));
	if (best && best.episodes >= 3) {
		slides.push({
			kind: 'binge',
			series: await ref(best.titleKey, true),
			episodes: best.episodes,
			minutes: Math.round(best.seconds / 60),
			start: localIso(best.start, ctx.tz),
			end: localIso(best.end, ctx.tz),
			date: dayNumberToKey(localDayNumber(best.start, ctx.tz)),
			episodeLabels: best.labels.slice(0, 40)
		});
	}

	// ---- clock
	const clock = clockPersona(buckets.hourly);
	stats.clock = { hourlyMinutes: buckets.hourly.map((s) => Math.round(s / 60)), persona: clock.title, share: clock.share };
	if (clock.totalSeconds >= 2 * 3600) {
		slides.push({
			kind: 'clock',
			hourly: buckets.hourly.map((s) => Math.round(s / 60)),
			persona: clock.id,
			personaTitle: clock.title,
			windowShare: clock.share,
			peakHour: clock.peakHour
		});
	}

	// ---- busiest day
	const busy = busiestDay(buckets.daily);
	if (busy && busy.agg.seconds >= 30 * 60) {
		const dayTitles = [...busy.agg.titles.entries()].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 6);
		slides.push({
			kind: 'busiest-day',
			date: dayNumberToKey(busy.day),
			weekday: weekdayName(busy.day),
			minutes: Math.round(busy.agg.seconds / 60),
			titles: await Promise.all(
				dayTitles.map(async ([k, v]) => ({
					...(await ref(k)),
					minutes: Math.round(v.seconds / 60),
					episodes: k.startsWith('series') ? v.units.size : 0
				}))
			)
		});
		stats.busiestDay = { date: dayNumberToKey(busy.day), minutes: Math.round(busy.agg.seconds / 60) };
	}

	// ---- streak
	stats.streak = { days: streak.length, start: streak.length ? dayNumberToKey(streak.start) : null, activeDays: streak.activeDays };
	if (streak.length >= 3) {
		const firstDay = localDayNumber(ctx.rangeStart, ctx.tz);
		const lastDay = localDayNumber(ctx.rangeEnd - 1, ctx.tz);
		let minutes = 0;
		const streakTitles = new Set<string>();
		for (let d = streak.start; d <= streak.end; d++) {
			const agg = buckets.daily.get(d);
			if (!agg) continue;
			minutes += agg.seconds / 60;
			for (const k of agg.titles.keys()) streakTitles.add(k);
		}
		slides.push({
			kind: 'streak',
			days: streak.length,
			start: dayNumberToKey(streak.start),
			end: dayNumberToKey(streak.end),
			minutes: Math.round(minutes),
			titleCount: streakTitles.size,
			activeDays: streak.activeDays,
			heat: heatLevels(buckets.daily, firstDay, lastDay - firstDay + 1),
			streakStartIndex: streak.start - firstDay
		});
	}

	// ---- obscurity
	const candidates = popularityCandidates(tStats, titles);
	if (candidates.length >= 4) {
		const obscure = candidates[0];
		const popular = candidates[candidates.length - 1];
		const server = input.serverPopularity.length ? input.serverPopularity : candidates.map((c) => c.popularity);
		const morePopular = server.filter((p) => p > obscure.popularity).length / Math.max(1, server.length);
		slides.push({
			kind: 'original',
			title: { ...(await ref(obscure.stat.titleKey, true)), popularity: round1(obscure.popularity), minutes: Math.round(obscure.stat.seconds / 60) },
			mainstream: { ...(await ref(popular.stat.titleKey)), popularity: round1(popular.popularity) },
			morePopularShare: morePopular,
			consideredTitles: candidates.length
		});
	}

	// ---- requests
	const req = input.requests;
	if (req && req.total > 0) {
		const posters = req.titles.map((x) => x.posterTitle).filter((x): x is TitleRef => Boolean(x));
		const slide: RequestsSlide = {
			kind: 'requests',
			total: req.total,
			movies: req.movies,
			shows: req.shows,
			posters: posters.slice(0, 12),
			goodTaste: { titles: req.goodTasteTitles, viewers: req.goodTasteViewers, examples: req.goodTasteExamples.slice(0, 6) }
		};
		slides.push(slide);
		stats.requests = { total: req.total, movies: req.movies, shows: req.shows, goodTasteTitles: req.goodTasteTitles, goodTasteViewers: req.goodTasteViewers };
	}

	// ---- personality
	const metrics = personalityMetrics(input, tStats, genres, allBinges.length ? bigBinges.length : 0, best?.episodes ?? 0, buckets);
	stats.personalityMetrics = metrics;
	stats.personalityScores = scorePersonalities(metrics).map((s) => ({ ...s, name: PERSONALITY_NAMES[s.id], strength: Math.round(s.strength * 100) / 100 }));
	const persona = choosePersonality(metrics);
	if (persona) {
		slides.push({
			kind: 'personality',
			id: persona.primary.id,
			name: persona.primary.name,
			tagline: persona.primary.tagline,
			explanation: persona.primary.explanation,
			evidence: persona.primary.evidence,
			runnerUp: persona.runnerUp ? { id: persona.runnerUp.id, name: persona.runnerUp.name } : null
		});
	}

	// ---- summary
	const genreSlide = slides.find((s) => s.kind === 'genres');
	slides.push({
		kind: 'summary',
		minutes: t.minutes,
		topMovie: topMovieRefs[0] ?? null,
		topShow: topShowRefs[0] ?? null,
		genre: genreSlide?.kind === 'genres' ? genreSlide.dominant.name : (genres[0]?.name ?? null),
		streakDays: streak.length >= 2 ? streak.length : null,
		personality: persona ? { id: persona.primary.id, name: persona.primary.name } : null,
		clockPersona: clock.totalSeconds >= 2 * 3600 ? clock.title : null
	});

	const report: WrappedReport = {
		version: REPORT_VERSION,
		year,
		userId: input.userId,
		userName: input.userName,
		generatedAt: new Date().toISOString(),
		rangeStart: dayNumberToKey(localDayNumber(ctx.rangeStart, ctx.tz)),
		rangeEnd: dayNumberToKey(localDayNumber(ctx.rangeEnd - 1, ctx.tz)),
		yearToDate: input.yearToDate,
		timezone: ctx.tz,
		slides,
		backdrop: collage.slice(0, 12)
	};
	stats.slides = slides.map((s) => s.kind);
	stats.allTitles = [...tStats.values()]
		.sort((a, b) => b.seconds - a.seconds)
		.map((s) => ({ title: titles.get(s.titleKey)?.title ?? s.titleKey, kind: s.kind, minutes: Math.round(s.seconds / 60), plays: s.plays, units: s.units, popularity: titles.get(s.titleKey)?.popularity ?? null, missingFromLibrary: titles.get(s.titleKey)?.missingFromLibrary ?? false }));
	return { report, stats, minutes: t.minutes };
}

function personalityMetrics(
	input: BuildInput,
	tStats: ReturnType<typeof titleStats>,
	genres: ReturnType<typeof genreDistribution>,
	bingeCount: number,
	longestBinge: number,
	buckets: ReturnType<typeof timeBuckets>
): PersonalityMetrics {
	const { views, ctx, year } = input;
	const titles = ctx.titles;
	const t = totals(views);
	let popKnown = 0,
		obscure = 0,
		dated = 0,
		recentPopular = 0,
		old = 0;
	const yearPairs: [number, number][] = [];
	for (const s of tStats.values()) {
		const meta = titles.get(s.titleKey);
		if (!meta) continue;
		if (meta.popularity != null) {
			popKnown += s.seconds;
			if (meta.popularity < OBSCURE_POPULARITY) obscure += s.seconds;
		}
		if (meta.year) {
			dated += s.seconds;
			yearPairs.push([meta.year, s.seconds]);
			if (meta.year >= year - 1 && (meta.popularity ?? 0) >= POPULAR_POPULARITY) recentPopular += s.seconds;
			if (meta.year <= year - 20) old += s.seconds;
		}
	}
	const series = [...tStats.values()].filter((s) => s.kind === 'series').sort((a, b) => b.seconds - a.seconds);
	const topSeries = series[0];

	// season completion: distinct episodes watched per (series, season) vs. season size
	const seasonUnits = new Map<string, Set<string>>();
	for (const v of views) {
		if (v.kind !== 'episode' || v.season == null || v.season < 1) continue;
		const k = `${v.titleKey}|${v.season}`;
		let set = seasonUnits.get(k);
		if (!set) seasonUnits.set(k, (set = new Set()));
		set.add(v.unitKey);
	}
	let seasonsStarted = 0,
		seasonsCompleted = 0;
	for (const [k, set] of seasonUnits) {
		const [titleKey, season] = k.split('|');
		const size = titles.get(titleKey)?.seasonEpisodes?.[Number(season)];
		if (!size) continue;
		seasonsStarted++;
		if (set.size >= size) seasonsCompleted++;
	}
	const movies = [...tStats.values()].filter((s) => s.kind === 'movie');

	return {
		totalHours: t.seconds / 3600,
		tvShare: t.seconds ? t.tvSeconds / t.seconds : 0,
		movieShare: t.seconds ? t.movieSeconds / t.seconds : 0,
		movies: t.movies,
		series: t.series,
		episodes: t.episodes,
		views: t.views,
		bingeCount,
		longestBinge,
		rewatchViews: t.rewatchViews,
		rewatchedTitles: new Set(views.filter((v) => v.rewatch).map((v) => v.titleKey)).size,
		genreCount: genres.length,
		genreEvenness: evenness(genres.map((g) => g.share)),
		topSeriesName: topSeries ? (titles.get(topSeries.titleKey)?.title ?? null) : null,
		topSeriesShareOfTv: topSeries && t.tvSeconds ? topSeries.seconds / t.tvSeconds : 0,
		topSeriesEpisodes: topSeries?.units ?? 0,
		popularityKnownShare: t.seconds ? popKnown / t.seconds : 0,
		obscureShare: popKnown ? obscure / popKnown : 0,
		recentPopularShare: dated ? recentPopular / dated : 0,
		oldShare: dated ? old / dated : 0,
		medianReleaseYear: weightedMedian(yearPairs),
		weekendShare: weekendShare(buckets),
		moviesStarted: movies.length,
		moviesCompleted: movies.filter((m) => m.completedViews > 0).length,
		seasonsStarted,
		seasonsCompleted,
		sampledSeries: series.filter((s) => s.units <= 2).length,
		requests: input.requests?.total ?? 0,
		goodTasteTitles: input.requests?.goodTasteTitles ?? 0
	};
}
