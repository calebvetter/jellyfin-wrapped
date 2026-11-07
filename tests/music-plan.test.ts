import { describe, expect, it } from 'vitest';
import { buildMusicPlan, type MusicTrack } from '../src/lib/server/music-plan';
import { mockReport } from '../src/lib/mock/mockReport';

const track = (titleKey: string, id = `t-${titleKey}`): MusicTrack => ({ id, url: `/audio/t/${id}`, start: 30, end: null, gain: 0.9, label: titleKey, titleKey });

describe('music plan', () => {
	const report = mockReport();
	const kinds = [...report.slides.map((s) => s.kind), 'outro'];
	const at = (plan: (string | null)[], kind: string) => plan[kinds.indexOf(kind)];
	const key = (title: string, kind = 'series') => `${kind}:mock:${title}`;

	it('plays each slide’s own title and bookends with the hero track', () => {
		const tracks = new Map([
			[key('The Salt Kingdom'), [track(key('The Salt Kingdom'))]], // #1 show → hero
			[key('Paper Comets', 'movie'), [track(key('Paper Comets', 'movie'))]], // #1 movie
			[key('Night Shift at Orbit 9'), [track(key('Night Shift at Orbit 9'))]], // binge series
			[key('Fog Over Kestrel', 'movie'), [track(key('Fog Over Kestrel', 'movie'))]] // obscure pick
		]);
		const { plan, tracks: used } = buildMusicPlan(report, tracks);
		const hero = `t-${key('The Salt Kingdom')}`;
		expect(at(plan, 'intro')).toBe(hero);
		expect(at(plan, 'total-time')).toBe(hero);
		expect(at(plan, 'top-shows')).toBe(hero);
		expect(at(plan, 'top-movies')).toBe(`t-${key('Paper Comets', 'movie')}`);
		expect(at(plan, 'binge')).toBe(`t-${key('Night Shift at Orbit 9')}`);
		expect(at(plan, 'clock')).toBe(at(plan, 'binge')); // clock keeps the current music
		expect(at(plan, 'original')).toBe(`t-${key('Fog Over Kestrel', 'movie')}`);
		expect(at(plan, 'summary')).toBe(hero);
		expect(at(plan, 'outro')).toBe(hero);
		expect(new Set(plan).size).toBeLessThanOrEqual(used.length);
		// only tracks actually used are sent to the browser
		expect(used.map((t) => t.id).sort()).toEqual([...new Set(plan)].filter(Boolean).sort());
	});

	it('keeps the current music when a slide shares a title with it', () => {
		const tracks = new Map([[key('The Salt Kingdom'), [track(key('The Salt Kingdom'))]]]);
		const { plan } = buildMusicPlan(report, tracks);
		// genre slide's dominant title is The Salt Kingdom → no restart
		expect(at(plan, 'genres')).toBe(at(plan, 'top-shows'));
		expect(new Set(plan)).toEqual(new Set([`t-${key('The Salt Kingdom')}`]));
	});

	it('falls back to server-wide music when the user has none', () => {
		const fb = track('movie:mock:Somebody Else’s Favourite', 'fallback');
		const { plan } = buildMusicPlan(report, new Map(), [fb]);
		expect(plan.every((p) => p === 'fallback')).toBe(true);
	});

	it('plays admin-assigned generic music on its screens', () => {
		const tracks = new Map([[key('The Salt Kingdom'), [track(key('The Salt Kingdom'))]]]);
		const intro = track('generic', 'g-intro');
		const finale = track('generic', 'g-finale');
		const { plan, tracks: used } = buildMusicPlan(report, tracks, [], { intro, summary: finale, clock: intro });
		const hero = `t-${key('The Salt Kingdom')}`;
		expect(at(plan, 'intro')).toBe('g-intro');
		expect(at(plan, 'top-shows')).toBe(hero); // title slides keep their own music
		expect(at(plan, 'clock')).toBe('g-intro');
		expect(at(plan, 'summary')).toBe('g-finale');
		expect(at(plan, 'outro')).toBe('g-finale'); // Rewatch follows the finale
		expect(used.map((t) => t.id).sort()).toEqual(['g-finale', 'g-intro', hero].sort());
	});

	it('uses the generic fallback slot for users with no music of their own', () => {
		const fb = track('generic', 'g-fallback');
		const server = track('movie:mock:Popular', 'server-fallback');
		const { plan } = buildMusicPlan(report, new Map(), [server], { fallback: fb });
		expect(plan.every((p) => p === 'g-fallback')).toBe(true);
		// …but never overrides a user's own music
		const own = new Map([[key('The Salt Kingdom'), [track(key('The Salt Kingdom'))]]]);
		expect(buildMusicPlan(report, own, [server], { fallback: fb }).plan).not.toContain('g-fallback');
	});

	it('is silent with no music anywhere', () => {
		const { plan, tracks } = buildMusicPlan(report, new Map(), []);
		expect(plan.every((p) => p === null)).toBe(true);
		expect(tracks).toEqual([]);
	});
});
