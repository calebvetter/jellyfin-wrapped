/**
 * Deterministic mock Wrapped reports for visual development (/preview).
 * All titles and people are fictional; artwork is generated SVG.
 */
import type { PersonalityId, RankedTitle, Slide, TitleRef, WrappedReport } from '$shared/report';
import { REPORT_VERSION } from '$shared/report';

const SHOWS = ['The Salt Kingdom', 'Night Shift at Orbit 9', 'Bakers of Brindle Lane', 'Static & Smoke', 'The Long Thaw', 'Velvet Precinct', 'Tidepool'];
const MOVIES = ['Paper Comets', 'Glass Harbor', 'The Last Lighthouse Keeper', 'Midnight Velocity', 'Honey & Thunder', 'Arcadia Drive', 'Fog Over Kestrel'];

const poster = (seed: string) => `/preview/art/poster/${encodeURIComponent(seed)}`;
const person = (seed: string) => `/preview/art/person/${encodeURIComponent(seed)}`;

function ref(title: string, kind: 'movie' | 'series', year: number, backdrop = false): TitleRef {
	return { key: `${kind}:mock:${title}`, kind, title, year, poster: poster(title), backdrop: backdrop ? `/preview/art/backdrop/${encodeURIComponent(title)}` : null };
}

const PERSONALITIES: Record<PersonalityId, { name: string; tagline: string; explanation: string; evidence: { label: string; value: string }[] }> = {
	'serial-binger': {
		name: 'The Serial Binger',
		tagline: '"Just one more" is a lifestyle.',
		explanation: '78% of your time went to TV, and you pulled off 23 proper binges (3+ episodes back to back). Your longest ran 11 episodes deep. The autoplay countdown never stood a chance.',
		evidence: [
			{ label: 'Binge sessions', value: '23' },
			{ label: 'Longest binge', value: '11 eps' },
			{ label: 'Time on TV', value: '78%' }
		]
	},
	'cinema-connoisseur': { name: 'The Cinema Connoisseur', tagline: 'Two hours, one story, no filler.', explanation: '64% of your watch time was feature films — 58 different movies.', evidence: [{ label: 'Movies watched', value: '58' }] },
	'comfort-creature': { name: 'The Comfort Creature', tagline: 'Why gamble when you already know it’s good?', explanation: 'You rewatched 31 things you had already finished this year.', evidence: [{ label: 'Rewatches', value: '31' }] },
	'genre-hopper': { name: 'The Genre Hopper', tagline: 'Rom-com at noon, horror by midnight.', explanation: 'You spread your time across 16 genres.', evidence: [{ label: 'Genres explored', value: '16' }] },
	'deep-diver': { name: 'The Deep Diver', tagline: 'One world. Fully explored.', explanation: 'The Salt Kingdom took 61% of all your TV time — 74 episodes.', evidence: [{ label: 'Episodes of one show', value: '74' }] },
	'hidden-gem-hunter': { name: 'The Hidden Gem Hunter', tagline: 'You liked it before it was cool. It may never be cool.', explanation: '42% of your watch time went to titles well off the TMDb popularity radar.', evidence: [{ label: 'Time on deep cuts', value: '42%' }] },
	'trend-chaser': { name: 'The Trend Chaser', tagline: 'If it’s trending, you’ve already seen it.', explanation: '57% of your viewing was buzzy, recent releases.', evidence: [{ label: 'Time on new & hot', value: '57%' }] },
	'time-traveler': { name: 'The Time Traveler', tagline: 'They really don’t make them like they used to.', explanation: '48% of your watch time went to titles at least 20 years old.', evidence: [{ label: 'Typical release year', value: '1994' }] },
	'weekend-warrior': { name: 'The Weekend Warrior', tagline: 'Saturdays are for the couch.', explanation: 'Weekends got 61% of your viewing.', evidence: [{ label: 'Viewing on weekends', value: '61%' }] },
	completionist: { name: 'The Completionist', tagline: 'You finish what you start. Every. Single. Time.', explanation: 'Of the 40 movies and seasons you started, you finished 37 (93%).', evidence: [{ label: 'Movies finished', value: '24/25' }, { label: 'Seasons finished', value: '13/15' }] },
	sampler: { name: 'The Sampler', tagline: 'A pilot here, a pilot there.', explanation: 'You tried 21 different series and bailed on 13 of them within two episodes.', evidence: [{ label: 'Series sampled', value: '21' }] },
	tastemaker: { name: 'The Tastemaker', tagline: 'You pick it. Everyone watches it.', explanation: 'You requested 14 titles and 9 of them were later watched by other people on the server.', evidence: [{ label: 'Watched by others', value: '9' }] }
};

export interface MockOptions {
	name?: string;
	year?: number;
	personality?: PersonalityId;
	variant?: 'full' | 'light' | 'heavy';
	noArt?: boolean;
}

export function mockReport(opts: MockOptions = {}): WrappedReport {
	const year = opts.year ?? 2026;
	const name = opts.name ?? 'Alex';
	const pid = opts.personality ?? 'serial-binger';
	const art = !opts.noArt;
	const withArt = <T extends TitleRef>(t: T): T => (art ? t : { ...t, poster: null, backdrop: null });

	const shows: RankedTitle[] = SHOWS.slice(0, 5).map((t, i) => withArt({
		...ref(t, 'series', 2019 + i, i === 0),
		rank: i + 1,
		minutes: [5320, 3110, 2460, 1720, 1210][i],
		plays: [118, 64, 72, 40, 31][i],
		episodes: [96, 52, 61, 34, 28][i],
		score: [1, 0.68, 0.6, 0.41, 0.31][i]
	}));
	const movies: RankedTitle[] = MOVIES.slice(0, 5).map((t, i) => withArt({
		...ref(t, 'movie', [2024, 2011, 1998, 2025, 2016][i], i === 0),
		rank: i + 1,
		minutes: [412, 244, 236, 118, 121][i],
		plays: [3, 2, 2, 1, 1][i],
		score: [1, 0.65, 0.62, 0.38, 0.37][i]
	}));

	const heat: number[] = [];
	for (let d = 0; d < 310; d++) heat.push(d >= 118 && d < 152 ? 3 + (d % 3 === 0 ? 1 : 0) : [0, 0, 1, 2, 0, 3, 1, 0, 2, 4][(d * 7) % 10]);

	const full: Slide[] = [
		{ kind: 'intro', posters: [...shows, ...movies].map((t) => t.poster).filter((p): p is string => !!p) },
		{ kind: 'total-time', minutes: 31_870, hours: 531, days: 22.1, movies: 47, episodes: 612, series: 23, activeDays: 241 },
		{ kind: 'top-shows', items: shows },
		{ kind: 'top-movies', items: movies, rewatches: 6 },
		{
			kind: 'genres',
			genres: [
				{ name: 'Drama', minutes: 8200, share: 0.29 },
				{ name: 'Comedy', minutes: 5600, share: 0.2 },
				{ name: 'Science Fiction', minutes: 4100, share: 0.145 },
				{ name: 'Crime', minutes: 3300, share: 0.117 },
				{ name: 'Animation', minutes: 2300, share: 0.081 },
				{ name: 'Mystery', minutes: 1900, share: 0.067 },
				{ name: 'Documentary', minutes: 1200, share: 0.042 },
				{ name: 'Everything else', minutes: 1600, share: 0.058 }
			],
			dominant: { name: 'Drama', minutes: 8200, share: 0.29, title: withArt(ref(SHOWS[0], 'series', 2019)) },
			totalGenres: 17
		},
		{
			kind: 'actor',
			actor: { name: 'Marisol Vance', portrait: art ? person('Marisol Vance') : null },
			titleCount: 5,
			minutes: 2840,
			titles: [
				{ ...withArt(ref(SHOWS[0], 'series', 2019)), character: 'Queen Aster' },
				{ ...withArt(ref(MOVIES[1], 'movie', 2011)), character: 'Dr. Ilse Varga' },
				{ ...withArt(ref(MOVIES[4], 'movie', 2016)), character: 'Juno' },
				{ ...withArt(ref(SHOWS[5], 'series', 2022)), character: 'Det. Rae Collins' },
				{ ...withArt(ref(MOVIES[6], 'movie', 2009)), character: null }
			],
			runnersUp: [
				{ name: 'Theo Okafor', portrait: art ? person('Theo Okafor') : null, titleCount: 4 },
				{ name: 'June Halvorsen', portrait: art ? person('June Halvorsen') : null, titleCount: 3 }
			]
		},
		{
			kind: 'binge',
			series: withArt(ref(SHOWS[1], 'series', 2021, true)),
			episodes: 11,
			minutes: 498,
			start: `${year}-03-14T18:42`,
			end: `${year}-03-15T03:16`,
			date: `${year}-03-14`,
			episodeLabels: Array.from({ length: 11 }, (_, i) => `S2E${i + 1}`)
		},
		{
			kind: 'clock',
			hourly: [210, 120, 40, 12, 4, 2, 6, 14, 22, 30, 45, 60, 90, 110, 105, 120, 180, 260, 420, 610, 820, 980, 860, 540],
			persona: 'night-owl',
			personaTitle: 'The Night Owl',
			windowShare: 0.47,
			peakHour: 21
		},
		{
			kind: 'busiest-day',
			date: `${year}-07-04`,
			weekday: 'Saturday',
			minutes: 734,
			titles: [
				{ ...withArt(ref(SHOWS[2], 'series', 2020)), minutes: 352, episodes: 8 },
				{ ...withArt(ref(MOVIES[3], 'movie', 2025)), minutes: 128, episodes: 0 },
				{ ...withArt(ref(MOVIES[0], 'movie', 2024)), minutes: 137, episodes: 0 },
				{ ...withArt(ref(SHOWS[4], 'series', 2023)), minutes: 117, episodes: 3 }
			]
		},
		{ kind: 'streak', days: 34, start: `${year}-04-29`, end: `${year}-06-01`, minutes: 4210, titleCount: 19, activeDays: 241, heat, streakStartIndex: 118 },
		{
			kind: 'original',
			title: { ...withArt(ref('Fog Over Kestrel', 'movie', 2009, true)), popularity: 1.4, minutes: 104 },
			mainstream: { ...withArt(ref(MOVIES[3], 'movie', 2025)), popularity: 186.2 },
			morePopularShare: 0.96,
			consideredTitles: 61
		},
		{
			kind: 'requests',
			total: 14,
			movies: 9,
			shows: 5,
			posters: [...MOVIES, ...SHOWS].slice(0, 12).map((t, i) => withArt(ref(t, i < 7 ? 'movie' : 'series', 2020))),
			goodTaste: { titles: 9, viewers: 6, examples: MOVIES.slice(0, 4).map((t) => withArt(ref(t, 'movie', 2020))) }
		},
		{
			kind: 'personality',
			id: pid,
			...PERSONALITIES[pid],
			runnerUp: pid === 'completionist' ? { id: 'serial-binger', name: 'The Serial Binger' } : { id: 'completionist', name: 'The Completionist' }
		},
		{
			kind: 'summary',
			minutes: 31_870,
			topMovie: movies[0],
			topShow: shows[0],
			genre: 'Drama',
			streakDays: 34,
			personality: { id: pid, name: PERSONALITIES[pid].name },
			clockPersona: 'The Night Owl'
		}
	];

	if (opts.variant === 'heavy') {
		// a very heavy viewer: 80 days of watch time → long row of day pills
		full[1] = { kind: 'total-time', minutes: 115_200, hours: 1920, days: 80, movies: 212, episodes: 2140, series: 61, activeDays: 301 };
	}
	const slides =
		opts.variant === 'light'
			? full.filter((s) => ['intro', 'total-time', 'top-shows', 'clock', 'busiest-day', 'summary'].includes(s.kind)).map((s) =>
					s.kind === 'summary' ? { ...s, topMovie: null, genre: null, streakDays: null, personality: null } : s
				)
			: full;

	return {
		version: REPORT_VERSION,
		year,
		userId: 'mock-user',
		userName: name,
		generatedAt: new Date().toISOString(),
		rangeStart: `${year}-01-01`,
		rangeEnd: `${year}-11-06`,
		yearToDate: true,
		timezone: 'America/Chicago',
		slides,
		backdrop: [...shows, ...movies].map((t) => t.poster).filter((p): p is string => !!p)
	};
}
