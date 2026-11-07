/**
 * Contract between the story player and slide components.
 * Slides build GSAP timelines through `ctx.timeline(root, build)` so the player can
 * pause/resume them (hold-to-pause), and honour reduced-motion preferences.
 */
import { getContext, setContext } from 'svelte';
import { gsap } from 'gsap';
import type { WrappedReport } from '$shared/report';

export type { SfxName } from '$shared/sfx';
import type { SfxName } from '$shared/sfx';

export interface StoryContext {
	report: WrappedReport;
	reducedMotion: boolean;
	/** Create a timeline scoped to `root`; it is paused/resumed with the story and killed on unmount. */
	timeline: (root: HTMLElement, build: (tl: gsap.core.Timeline, q: (sel: string) => Element[]) => void) => gsap.core.Timeline;
	sfx: (name: SfxName, opts?: { delay?: number; pitch?: number }) => void;
	/** Seconds this slide will stay on screen. */
	duration: number;
	/** Preview mode (admin preview / mock): no analytics. */
	preview: boolean;
}

const KEY = Symbol('story');

export function setStoryContext(ctx: StoryContext) {
	setContext(KEY, ctx);
}

export function story(): StoryContext {
	return getContext<StoryContext>(KEY);
}
