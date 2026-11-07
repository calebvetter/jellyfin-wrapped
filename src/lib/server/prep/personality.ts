/**
 * Watching personality: every candidate computes a `strength` from real behaviour.
 * strength >= 1 means the trait qualifies; the strongest qualifying trait wins.
 * Each trait produces its own data-backed explanation.
 */
import type { PersonalityId } from '$shared/report';

export interface PersonalityMetrics {
	totalHours: number;
	tvShare: number;
	movieShare: number;
	movies: number;
	series: number;
	episodes: number;
	views: number;
	bingeCount: number; // binges with >= 3 episodes
	longestBinge: number;
	rewatchViews: number;
	rewatchedTitles: number;
	genreCount: number;
	genreEvenness: number; // 0..1
	topSeriesName: string | null;
	topSeriesShareOfTv: number;
	topSeriesEpisodes: number;
	popularityKnownShare: number; // share of watch time with known popularity
	obscureShare: number; // share of (known) watch time on low-popularity titles
	recentPopularShare: number; // share of (dated) watch time on recent + popular releases
	oldShare: number; // share of (dated) watch time on titles >= 20 years old
	medianReleaseYear: number | null;
	weekendShare: number;
	moviesStarted: number;
	moviesCompleted: number;
	seasonsStarted: number;
	seasonsCompleted: number;
	sampledSeries: number; // series with <= 2 distinct episodes watched
	requests: number;
	goodTasteTitles: number;
}

export interface PersonalityResult {
	id: PersonalityId;
	name: string;
	tagline: string;
	explanation: string;
	evidence: { label: string; value: string }[];
	strength: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (x: number) => x.toLocaleString('en-US');
const clamp = (x: number, lo = 0, hi = 3) => Math.max(lo, Math.min(hi, x));

type Candidate = {
	id: PersonalityId;
	name: string;
	tagline: string;
	strength: (m: PersonalityMetrics) => number;
	explain: (m: PersonalityMetrics) => { explanation: string; evidence: { label: string; value: string }[] };
};

export const PERSONALITIES: Candidate[] = [
	{
		id: 'serial-binger',
		name: 'The Serial Binger',
		tagline: '"Just one more" is a lifestyle.',
		strength: (m) => (m.tvShare >= 0.6 && m.bingeCount >= 4 ? clamp((m.tvShare / 0.6) * 0.5 + (m.bingeCount / 6) * 0.6) : 0),
		explain: (m) => ({
			explanation: `${pct(m.tvShare)} of your time went to TV, and you pulled off ${n(m.bingeCount)} proper binges (3+ episodes back to back). Your longest ran ${m.longestBinge} episodes deep. The autoplay countdown never stood a chance.`,
			evidence: [
				{ label: 'Binge sessions', value: n(m.bingeCount) },
				{ label: 'Longest binge', value: `${m.longestBinge} eps` },
				{ label: 'Time on TV', value: pct(m.tvShare) }
			]
		})
	},
	{
		id: 'cinema-connoisseur',
		name: 'The Cinema Connoisseur',
		tagline: 'Two hours, one story, no filler.',
		strength: (m) => (m.movieShare >= 0.55 && m.movies >= 8 ? clamp((m.movieShare / 0.55) * 0.6 + (m.movies / 20) * 0.5) : 0),
		explain: (m) => ({
			explanation: `${pct(m.movieShare)} of your watch time was feature films — ${n(m.movies)} different movies. Series? You prefer a story that knows when to roll credits.`,
			evidence: [
				{ label: 'Movies watched', value: n(m.movies) },
				{ label: 'Time on movies', value: pct(m.movieShare) }
			]
		})
	},
	{
		id: 'comfort-creature',
		name: 'The Comfort Creature',
		tagline: 'Why gamble when you already know it’s good?',
		strength: (m) => {
			const ratio = m.views ? m.rewatchViews / m.views : 0;
			return m.rewatchViews >= 5 && ratio >= 0.12 ? clamp(ratio / 0.12 * 0.7 + m.rewatchedTitles / 10 * 0.4) : 0;
		},
		explain: (m) => ({
			explanation: `You rewatched ${n(m.rewatchViews)} things you'd already finished this year, across ${n(m.rewatchedTitles)} different titles. Familiar faces, guaranteed endings, zero risk.`,
			evidence: [
				{ label: 'Rewatches', value: n(m.rewatchViews) },
				{ label: 'Comfort titles', value: n(m.rewatchedTitles) }
			]
		})
	},
	{
		id: 'genre-hopper',
		name: 'The Genre Hopper',
		tagline: 'Rom-com at noon, horror by midnight.',
		strength: (m) => (m.genreCount >= 8 && m.genreEvenness >= 0.78 ? clamp((m.genreEvenness / 0.78) * 0.6 + (m.genreCount / 12) * 0.5) : 0),
		explain: (m) => ({
			explanation: `You spread your time across ${n(m.genreCount)} genres without letting any one of them take over. Your watchlist reads like a film festival programme.`,
			evidence: [
				{ label: 'Genres explored', value: n(m.genreCount) },
				{ label: 'Variety score', value: `${Math.round(m.genreEvenness * 100)}/100` }
			]
		})
	},
	{
		id: 'deep-diver',
		name: 'The Deep Diver',
		tagline: 'One world. Fully explored.',
		strength: (m) =>
			m.topSeriesShareOfTv >= 0.4 && m.topSeriesEpisodes >= 15 && m.tvShare >= 0.4
				? clamp((m.topSeriesShareOfTv / 0.4) * 0.7 + (m.topSeriesEpisodes / 40) * 0.4)
				: 0,
		explain: (m) => ({
			explanation: `${m.topSeriesName ?? 'One series'} took ${pct(m.topSeriesShareOfTv)} of all your TV time — ${n(m.topSeriesEpisodes)} episodes. You don't watch shows, you move in.`,
			evidence: [
				{ label: 'Episodes of one show', value: n(m.topSeriesEpisodes) },
				{ label: 'Share of TV time', value: pct(m.topSeriesShareOfTv) }
			]
		})
	},
	{
		id: 'hidden-gem-hunter',
		name: 'The Hidden Gem Hunter',
		tagline: 'You liked it before it was cool. It may never be cool.',
		strength: (m) => (m.popularityKnownShare >= 0.4 && m.obscureShare >= 0.3 ? clamp((m.obscureShare / 0.3) * 1.0) : 0),
		explain: (m) => ({
			explanation: `${pct(m.obscureShare)} of your watch time went to titles well off the TMDb popularity radar. The algorithm doesn't know what to do with you.`,
			evidence: [{ label: 'Time on deep cuts', value: pct(m.obscureShare) }]
		})
	},
	{
		id: 'trend-chaser',
		name: 'The Trend Chaser',
		tagline: 'If it’s trending, you’ve already seen it.',
		strength: (m) => (m.recentPopularShare >= 0.45 ? clamp(m.recentPopularShare / 0.45) : 0),
		explain: (m) => ({
			explanation: `${pct(m.recentPopularShare)} of your viewing was buzzy, recent releases. Spoilers can't touch you — you're always first.`,
			evidence: [{ label: 'Time on new & hot', value: pct(m.recentPopularShare) }]
		})
	},
	{
		id: 'time-traveler',
		name: 'The Time Traveler',
		tagline: 'They really don’t make them like they used to.',
		strength: (m) => (m.oldShare >= 0.35 ? clamp(m.oldShare / 0.35) : 0),
		explain: (m) => ({
			explanation: `${pct(m.oldShare)} of your watch time went to titles at least 20 years old${m.medianReleaseYear ? ` — your typical pick came out around ${m.medianReleaseYear}` : ''}. Who needs a DeLorean?`,
			evidence: [
				{ label: 'Time on 20+ yr old titles', value: pct(m.oldShare) },
				...(m.medianReleaseYear ? [{ label: 'Typical release year', value: String(m.medianReleaseYear) }] : [])
			]
		})
	},
	{
		id: 'weekend-warrior',
		name: 'The Weekend Warrior',
		tagline: 'Saturdays are for the couch.',
		strength: (m) => (m.weekendShare >= 0.45 ? clamp(m.weekendShare / 0.45) : 0),
		explain: (m) => ({
			explanation: `Weekends are only 29% of the week, but they got ${pct(m.weekendShare)} of your viewing. Monday-to-Friday you, meet Saturday you.`,
			evidence: [{ label: 'Viewing on weekends', value: pct(m.weekendShare) }]
		})
	},
	{
		id: 'completionist',
		name: 'The Completionist',
		tagline: 'You finish what you start. Every. Single. Time.',
		strength: (m) => {
			const started = m.moviesStarted + m.seasonsStarted;
			const done = m.moviesCompleted + m.seasonsCompleted;
			const rate = started ? done / started : 0;
			return started >= 6 && rate >= 0.75 ? clamp((rate / 0.75) * 0.8 + (done / 20) * 0.3) : 0;
		},
		explain: (m) => {
			const started = m.moviesStarted + m.seasonsStarted;
			const done = m.moviesCompleted + m.seasonsCompleted;
			return {
				explanation: `Of the ${n(started)} movies and seasons you started, you finished ${n(done)} (${pct(started ? done / started : 0)}). Cliffhangers fear you.`,
				evidence: [
					{ label: 'Movies finished', value: `${n(m.moviesCompleted)}/${n(m.moviesStarted)}` },
					{ label: 'Seasons finished', value: `${n(m.seasonsCompleted)}/${n(m.seasonsStarted)}` }
				]
			};
		}
	},
	{
		id: 'sampler',
		name: 'The Sampler',
		tagline: 'A pilot here, a pilot there.',
		strength: (m) => (m.sampledSeries >= 6 && m.series > 0 && m.sampledSeries / m.series >= 0.45 ? clamp((m.sampledSeries / m.series / 0.45) * 0.6 + (m.sampledSeries / 12) * 0.5) : 0),
		explain: (m) => ({
			explanation: `You tried ${n(m.series)} different series and bailed on ${n(m.sampledSeries)} of them within two episodes. Ruthless? No — efficient.`,
			evidence: [
				{ label: 'Series sampled', value: n(m.series) },
				{ label: 'Quit within 2 eps', value: n(m.sampledSeries) }
			]
		})
	},
	{
		id: 'tastemaker',
		name: 'The Tastemaker',
		tagline: 'You pick it. Everyone watches it.',
		strength: (m) => (m.goodTasteTitles >= 3 && m.requests > 0 && m.goodTasteTitles / m.requests >= 0.4 ? clamp((m.goodTasteTitles / m.requests / 0.4) * 0.6 + (m.goodTasteTitles / 8) * 0.6) : 0),
		explain: (m) => ({
			explanation: `You requested ${n(m.requests)} titles and ${n(m.goodTasteTitles)} of them were later watched by other people on the server. You're basically the programming director.`,
			evidence: [
				{ label: 'Requests', value: n(m.requests) },
				{ label: 'Watched by others', value: n(m.goodTasteTitles) }
			]
		})
	}
];

export const PERSONALITY_NAMES: Record<PersonalityId, string> = Object.fromEntries(PERSONALITIES.map((p) => [p.id, p.name])) as Record<
	PersonalityId,
	string
>;

/** Minimum activity before we assign any personality at all. */
export const PERSONALITY_MIN_HOURS = 3;

export function scorePersonalities(m: PersonalityMetrics) {
	return PERSONALITIES.map((p) => ({ id: p.id, strength: m.totalHours >= PERSONALITY_MIN_HOURS ? p.strength(m) : 0 })).sort(
		(a, b) => b.strength - a.strength
	);
}

export function choosePersonality(m: PersonalityMetrics): { primary: PersonalityResult; runnerUp: PersonalityResult | null; scores: { id: PersonalityId; strength: number }[] } | null {
	const scores = scorePersonalities(m);
	const qualifying = scores.filter((s) => s.strength >= 1);
	if (!qualifying.length) {
		// Nothing strongly qualifies: fall back to the user's dominant format, whose
		// explanation is still purely factual. Needs a minimum amount of viewing.
		if (m.totalHours < PERSONALITY_MIN_HOURS) return null;
		const fallback: PersonalityId = m.movieShare >= 0.5 || !m.topSeriesName ? 'cinema-connoisseur' : 'deep-diver';
		if (fallback === 'cinema-connoisseur' && m.movies === 0) return null;
		qualifying.push({ id: fallback, strength: 0.5 });
	}
	const build = (id: PersonalityId, strength: number): PersonalityResult => {
		const p = PERSONALITIES.find((x) => x.id === id)!;
		return { id, name: p.name, tagline: p.tagline, strength, ...p.explain(m) };
	};
	return {
		primary: build(qualifying[0].id, qualifying[0].strength),
		runnerUp: qualifying[1] ? build(qualifying[1].id, qualifying[1].strength) : null,
		scores
	};
}
