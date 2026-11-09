<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { setStoryContext, type SfxName, type StoryContext } from './context';
	import type { Slide, WrappedReport } from '$shared/report';
	import { SLIDES } from './slides/registry';
	import Outro from './slides/Outro.svelte';

	interface Props {
		slide: Slide | null; // null = outro
		report: WrappedReport;
		reducedMotion: boolean;
		duration: number;
		preview: boolean;
		sfx: (name: SfxName, opts?: { delay?: number; pitch?: number }) => void;
		onRewatch: () => void;
		onMusicCue: () => void;
		stopSfx: (name: SfxName) => void;
		setAdvanceHandler: (handler: (() => boolean) | null) => void;
	}

	let { slide, report, reducedMotion, duration, preview, sfx, onRewatch, onMusicCue, stopSfx, setAdvanceHandler }: Props = $props();

	const contexts: gsap.Context[] = [];

	const ctx: StoryContext = {
		get report() {
			return report;
		},
		get reducedMotion() {
			return reducedMotion;
		},
		get duration() {
			return duration;
		},
		get preview() {
			return preview;
		},
		sfx: (name, opts) => sfx(name, opts),
		musicCue: () => onMusicCue(),
		stopSfx: (name) => stopSfx(name),
		interceptAdvance: (handler) => setAdvanceHandler(handler),
		timeline(root, build) {
			let tl!: gsap.core.Timeline;
			const c = gsap.context(() => {
				tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
				build(tl, (sel) => gsap.utils.toArray<Element>(sel, root));
				if (reducedMotion) {
					// Honour reduced motion: jump to the composed end state and fade it in gently.
					const finite = tl.totalDuration() < 1e6;
					if (finite) tl.progress(1);
					else tl.pause(0);
					gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' });
				}
			}, root);
			contexts.push(c);
			return tl;
		}
	};
	setStoryContext(ctx);

	onMount(() => () => {
		setAdvanceHandler(null);
		for (const c of contexts) c.revert();
	});

	const Component = $derived(slide ? SLIDES[slide.kind] : null);
</script>

<div class="host" data-kind={slide?.kind ?? 'outro'}>
	{#if slide && Component}
		<Component {slide} />
	{:else}
		<Outro {onRewatch} />
	{/if}
</div>

<style>
	.host {
		position: absolute;
		inset: 0;
	}
</style>
