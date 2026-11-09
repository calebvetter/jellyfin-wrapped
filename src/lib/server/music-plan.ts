/**
 * Per-user music plan: which soundtrack plays on each slide.
 *
 * Every slide that features a title plays that title's music (#1 show on Top Shows, the
 * binge series on the binge slide, the obscure pick on You're an Original…). Slides without
 * a title of their own keep the current music. The user's "hero" track (their top title
 * with music) opens the story and bookends it on the summary and outro. Users with no music
 * for any of their titles fall back to the server's most-featured tracks.
 *
 * Pure function: the plan is built from the report and the currently available audio, at
 * page load (so new uploads apply without re-preparing).
 */
import type { Slide, SlideKind, WrappedReport } from '$shared/report';

import type { MusicPlan, MusicSlot, MusicTrack } from '$shared/music';
export type { MusicPlan, MusicTrack };

/** Title keys a slide is about, most important first. */
export function slideTitleKeys(slide: Slide): string[] {
	switch (slide.kind) {
		case 'top-shows':
		case 'top-movies':
			return slide.items.map((t) => t.key);
		case 'genres':
			return slide.dominant.title ? [slide.dominant.title.key] : [];
		case 'actor':
			return slide.titles.map((t) => t.key);
		case 'binge':
			return [slide.series.key];
		case 'busiest-day':
			return slide.titles.map((t) => t.key);
		case 'original':
			return [slide.title.key];
		case 'requests':
			// the highlighted title's music, or the current music if it has none (never another
			// poster's, which wouldn't match what's on screen); without a highlight, the most-watched request
			return slide.goodTaste.examples.length ? [slide.goodTaste.examples[0].key] : slide.posters.map((t) => t.key);
		case 'summary':
			return [slide.topShow?.key, slide.topMovie?.key].filter((k): k is string => Boolean(k));
		default:
			return [];
	}
}

/** Every title key in a report, roughly in order of how much it matters to the user. */
export function userTitleOrder(report: WrappedReport): string[] {
	const order: string[] = [];
	const add = (k: string | undefined | null) => {
		if (k && !order.includes(k)) order.push(k);
	};
	const by = <K extends SlideKind>(kind: K) => report.slides.find((s) => s.kind === kind) as Extract<Slide, { kind: K }> | undefined;
	const shows = by('top-shows')?.items ?? [];
	const movies = by('top-movies')?.items ?? [];
	add(shows[0]?.key);
	add(movies[0]?.key);
	add(by('binge')?.series.key);
	shows.slice(1).forEach((t) => add(t.key));
	movies.slice(1).forEach((t) => add(t.key));
	add(by('genres')?.dominant.title?.key);
	add(by('original')?.title.key);
	for (const s of report.slides) slideTitleKeys(s).forEach(add);
	return order;
}

/** Slides that never switch music on their own. */
const KEEP: (SlideKind | 'outro')[] = ['total-time', 'clock', 'streak'];

/**
 * @param slots generic tracks assigned by the admin to screens that aren't about one title
 *              (they override the user's own music on those screens); `fallback` slot plays
 *              for users with no music of their own.
 */
export function buildMusicPlan(
	report: WrappedReport,
	tracksByTitle: Map<string, MusicTrack[]>,
	fallback: MusicTrack[] = [],
	slots: Partial<Record<MusicSlot, MusicTrack>> = {}
): MusicPlan {
	const firstTrack = (key: string) => tracksByTitle.get(key)?.[0] ?? null;
	const order = userTitleOrder(report);
	const userTracks = order.map(firstTrack).filter((t): t is MusicTrack => Boolean(t));
	const hero = userTracks[0] ?? slots.fallback ?? fallback[0] ?? null;
	const used = new Map<string, MusicTrack>();
	const use = (t: MusicTrack | null) => {
		if (t) used.set(t.id, t);
		return t?.id ?? null;
	};

	const kinds: (SlideKind | 'outro')[] = [...report.slides.map((s) => s.kind), 'outro'];
	const plan: (string | null)[] = [];
	let current: string | null = null;
	kinds.forEach((kind, i) => {
		const slide = report.slides[i];
		let next: string | null = current;
		const generic = slots[(kind === 'outro' ? 'summary' : kind) as MusicSlot];
		if (generic) {
			next = use(generic); // admin-assigned generic music for this screen
		} else if (kind === 'intro' || kind === 'summary' || kind === 'outro') {
			next = use(hero) ?? current; // open and close on the user's signature track
		} else if (kind === 'personality') {
			// a change of scene for the big reveal: the next most important track we haven't leaned on
			const fresh = userTracks.find((t) => t.id !== current && t.id !== hero?.id) ?? null;
			next = use(fresh) ?? current;
		} else if (!KEEP.includes(kind) && slide) {
			const keys = slideTitleKeys(slide);
			// if the music already playing belongs to one of this slide's titles, keep it going
			const playing = current ? used.get(current) : undefined;
			if (!(playing && keys.includes(playing.titleKey))) {
				const own = keys.map(firstTrack).find(Boolean) ?? null;
				next = use(own) ?? current;
			}
		}
		if (next === null && hero) next = use(hero);
		plan.push(next);
		current = next;
	});
	return { tracks: [...used.values()], plan };
}
