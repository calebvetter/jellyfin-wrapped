/**
 * The ready-to-play Wrapped report. Produced once during preparation, stored as JSON,
 * and rendered by the story player without any recalculation (the one exception: the
 * clock follows the viewer's timezone, see $shared/clock).
 *
 * Only the requesting user's own data may appear here (plus anonymous aggregate counts,
 * e.g. the Good Taste metric). Never put other users' names or histories in a report.
 */
import type { ClockHistogram } from './clock';

export const REPORT_VERSION = 1;

export type TitleKind = 'movie' | 'series';

export interface TitleRef {
	key: string; // stable title key (e.g. "movie:tmdb:603" or "series:jf:abc")
	kind: TitleKind;
	title: string;
	year: number | null;
	poster: string | null; // local artwork URL (/art/<hash>) or null
	backdrop: string | null;
}

export interface RankedTitle extends TitleRef {
	rank: number;
	minutes: number;
	plays: number; // movie views (incl. rewatches) or episode plays
	episodes?: number; // distinct episodes watched (series)
	score: number; // 0..1 weighted score (70% watch time, 30% plays)
}

export interface IntroSlide {
	kind: 'intro';
	posters: string[]; // collage artwork
}

export interface TotalTimeSlide {
	kind: 'total-time';
	minutes: number;
	hours: number;
	days: number;
	movies: number;
	episodes: number;
	series: number;
	activeDays: number;
}

export interface TopShowsSlide {
	kind: 'top-shows';
	items: RankedTitle[];
}

export interface TopMoviesSlide {
	kind: 'top-movies';
	items: RankedTitle[];
	rewatches: number; // total extra views across all movies
}

export interface GenreShare {
	name: string;
	minutes: number;
	share: number; // 0..1
}

export interface GenresSlide {
	kind: 'genres';
	genres: GenreShare[]; // sorted desc, top 8 (+ "Everything else")
	dominant: GenreShare & { title: TitleRef | null };
	totalGenres: number;
}

export interface ActorSlide {
	kind: 'actor';
	actor: { name: string; portrait: string | null };
	titleCount: number;
	minutes: number;
	titles: (TitleRef & { character: string | null })[];
	runnersUp: { name: string; portrait: string | null; titleCount: number }[];
}

export interface BingeSlide {
	kind: 'binge';
	series: TitleRef;
	episodes: number;
	minutes: number; // watch time inside the binge
	start: string; // ISO local datetime "2026-03-14T19:05"
	end: string;
	date: string; // YYYY-MM-DD (local) of the start
	episodeLabels: string[]; // e.g. ["S1E1", "S1E2", ...]
}

export type ClockPersonaId = 'early-bird' | 'daytime-drifter' | 'afternoon-escapist' | 'prime-time' | 'night-owl' | 'midnight-gremlin';

export interface ClockSlide {
	kind: 'clock';
	hourly: number[]; // 24 entries, minutes watched per local hour
	persona: ClockPersonaId;
	personaTitle: string;
	windowShare: number; // share of minutes in the persona's 4-hour window
	peakHour: number;
	/** Viewing by UTC time, so the browser can redo the above in the viewer's timezone ($shared/clock). Absent on older reports. */
	utc?: ClockHistogram;
}

export interface BusiestDaySlide {
	kind: 'busiest-day';
	date: string; // YYYY-MM-DD
	weekday: string;
	minutes: number;
	titles: (TitleRef & { minutes: number; episodes: number })[];
}

export interface StreakSlide {
	kind: 'streak';
	days: number;
	start: string; // YYYY-MM-DD
	end: string;
	minutes: number;
	titleCount: number;
	activeDays: number;
	/** Per-day intensity (0-4) for every day in the prepared range, starting at rangeStart. */
	heat: number[];
	streakStartIndex: number;
}

export interface OriginalSlide {
	kind: 'original';
	title: TitleRef & { popularity: number; minutes: number };
	mainstream: (TitleRef & { popularity: number }) | null;
	/** Share (0..1) of the user's considered titles that were more popular. */
	morePopularShare: number;
	consideredTitles: number;
}

export interface RequestsSlide {
	kind: 'requests';
	total: number;
	movies: number;
	shows: number;
	posters: TitleRef[]; // most watched first
	goodTaste: {
		titles: number; // distinct requested titles later watched by at least one other user
		viewers: number; // distinct other users (count only — never names)
		/** Most watched by others first; examples[0] is the highlighted title and sets the music. */
		examples: TitleRef[];
	};
}

export type PersonalityId =
	| 'serial-binger'
	| 'cinema-connoisseur'
	| 'comfort-creature'
	| 'genre-hopper'
	| 'deep-diver'
	| 'hidden-gem-hunter'
	| 'trend-chaser'
	| 'time-traveler'
	| 'weekend-warrior'
	| 'completionist'
	| 'sampler'
	| 'tastemaker';

export interface PersonalitySlide {
	kind: 'personality';
	id: PersonalityId;
	name: string;
	tagline: string;
	explanation: string;
	evidence: { label: string; value: string }[];
	runnerUp: { id: PersonalityId; name: string } | null;
}

export interface SummarySlide {
	kind: 'summary';
	minutes: number;
	topMovie: TitleRef | null;
	topShow: TitleRef | null;
	genre: string | null;
	streakDays: number | null;
	personality: { id: PersonalityId; name: string } | null;
	clockPersona: string | null;
}

export type Slide =
	| IntroSlide
	| TotalTimeSlide
	| TopShowsSlide
	| TopMoviesSlide
	| GenresSlide
	| ActorSlide
	| BingeSlide
	| ClockSlide
	| BusiestDaySlide
	| StreakSlide
	| OriginalSlide
	| RequestsSlide
	| PersonalitySlide
	| SummarySlide;

export type SlideKind = Slide['kind'];

export interface WrappedReport {
	version: number;
	year: number;
	userId: string;
	userName: string;
	generatedAt: string; // ISO
	rangeStart: string; // YYYY-MM-DD local
	rangeEnd: string; // YYYY-MM-DD local (inclusive)
	yearToDate: boolean;
	timezone: string;
	slides: Slide[];
	/** Poster artwork for the desktop backdrop collage. */
	backdrop: string[];
}

/** Canonical slide order (content slides 1-13 follow the intro). */
export const SLIDE_ORDER: SlideKind[] = [
	'intro',
	'total-time',
	'top-shows',
	'top-movies',
	'genres',
	'actor',
	'binge',
	'clock',
	'busiest-day',
	'streak',
	'original',
	'requests',
	'personality',
	'summary'
];

export const SLIDE_LABELS: Record<SlideKind | 'outro', string> = {
	intro: 'Intro',
	'total-time': 'Total Watch Time',
	'top-shows': 'Top 5 TV Shows',
	'top-movies': 'Top 5 Movies',
	genres: 'Genre DNA',
	actor: 'You Had a Type',
	binge: 'Just One More Episode',
	clock: 'Viewing Time Personality',
	'busiest-day': 'Busiest Day',
	streak: 'Longest Streak',
	original: "You're an Original",
	requests: 'You Requested It',
	personality: 'Watching Personality',
	summary: 'Year in Review',
	outro: 'Rewatch'
};
