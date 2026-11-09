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
	/** Fade out a sound effect that's still playing. */
	stopSfx: (name: SfxName) => void;
	/**
	 * Let the slide handle "next" (tap, key or button) itself: while `handler` returns true
	 * the story stays on this slide. Used to skip ahead to a reveal instead of past it.
	 */
	interceptAdvance: (handler: () => boolean) => void;
	/**
	 * Slides in `DEFERRED_MUSIC` call this from their timeline when their own music should
	 * start (the crossfade takes CROSSFADE s, so cue that long before the big reveal).
	 */
	musicCue: () => void;
	/** Seconds this slide will stay on screen. */
	duration: number;
	/** Preview mode (admin preview / mock): no analytics. */
	preview: boolean;
}

const KEY = Symbol('story');

/**
 * Slides that keep the previous music on entry and switch to their own on `musicCue()`,
 * so the new track lands with the reveal instead of spoiling it.
 */
export const DEFERRED_MUSIC: string[] = ['top-shows', 'top-movies'];

export function setStoryContext(ctx: StoryContext) {
	setContext(KEY, ctx);
}

export function story(): StoryContext {
	return getContext<StoryContext>(KEY);
}
