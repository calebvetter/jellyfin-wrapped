<script lang="ts">
	import { onMount } from 'svelte';
	import type { PersonalitySlide } from '$shared/report';
	import { story } from '../context';
	import { confetti, offBelow } from '../anim';
	import Emblem from '../Emblem.svelte';

	let { slide }: { slide: PersonalitySlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const COLORS: Record<string, [string, string]> = {
		'serial-binger': ['#ff3ea5', '#14080a'],
		'cinema-connoisseur': ['#ff2d3d', '#fff6e6'],
		'comfort-creature': ['#ffb3d9', '#14080a'],
		'genre-hopper': ['#c6f432', '#14080a'],
		'deep-diver': ['#2448ff', '#fff6e6'],
		'hidden-gem-hunter': ['#2de2e6', '#14080a'],
		'trend-chaser': ['#ffe14d', '#14080a'],
		'time-traveler': ['#ff6a13', '#14080a'],
		'weekend-warrior': ['#9b6bff', '#fff6e6'],
		completionist: ['#c6f432', '#14080a'],
		sampler: ['#fff6e6', '#14080a'],
		tastemaker: ['#ff3ea5', '#fff6e6']
	};
	const color = $derived(COLORS[slide.id] ?? ['#ff3ea5', '#14080a']);
	const nameSize = $derived(slide.name.length > 22 ? 8.5 : 10);

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.pre'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.card'), { y: offBelow(root), rotateY: 0, duration: 0.9, ease: 'back.out(1.3)' }, 0.3)
				.add(() => s.sfx('drumroll'), 0.6)
				.to(q('.card'), { rotate: 3, duration: 0.08, yoyo: true, repeat: 23, ease: 'sine.inOut' }, 1.1)
				.to(q('.card'), { rotateY: 180, duration: 0.9, ease: 'back.out(1.4)' }, 3.4)
				.add(() => s.sfx('reveal'), 3.5)
				.to(q('.pre'), { opacity: 0.5, duration: 0.4 }, 3.4)
				.from(q('.front .emblem-wrap'), { scale: 0, rotate: -90, duration: 0.9, ease: 'elastic.out(1, 0.5)' }, 3.9)
				.from(q('.below > *'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.14 }, 4.4)
				.from(q('.chip'), { scale: 0, duration: 0.5, stagger: 0.1, ease: 'back.out(2)' }, 5);
			confetti(tl, root, 3.7, { x: 50, y: 38, count: 50, colors: [color[0], '#fff', '#ffe14d', '#2de2e6'] });
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.glow'), { rotate: 360, duration: 12, ease: 'none', repeat: -1 }, 0);
		});
	});
</script>

<div class="slide" bind:this={root} style:--c={color[0]} style:--cfg={color[1]}>
	<div class="glow" aria-hidden="true"></div>
	<p class="pre serif">Your watching personality is…</p>

	<div class="card-stage">
		<div class="card">
			<div class="face back" aria-hidden="true">
				<span class="q display">?</span>
			</div>
			<div class="face front">
				<div class="emblem-wrap"><Emblem id={slide.id} /></div>
				<h2 class="display" style:font-size="calc({nameSize} * var(--u))">{slide.name}</h2>
				<p class="tag serif">{slide.tagline}</p>
			</div>
		</div>
	</div>

	<div class="below">
		<p class="why">{slide.explanation}</p>
		<div class="chips">
			{#each slide.evidence as e}
				<span class="chip"><b>{e.value}</b>{e.label}</span>
			{/each}
		</div>
		{#if slide.runnerUp}<p class="runner">…with a strong side of <strong>{slide.runnerUp.name}</strong>.</p>{/if}
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: #0b0614;
		color: #fff;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		overflow: hidden;
	}

	.glow {
		position: absolute;
		width: calc(160 * var(--u));
		height: calc(160 * var(--u));
		left: 50%;
		top: 34%;
		margin: calc(-80 * var(--u)) 0 0 calc(-80 * var(--u));
		background: conic-gradient(from 0deg, transparent, color-mix(in srgb, var(--c) 45%, transparent), transparent 30%, color-mix(in srgb, var(--c) 30%, transparent), transparent 65%);
		filter: blur(30px);
		opacity: 0.8;
		pointer-events: none;
		border-radius: 50%;
		mask-image: radial-gradient(closest-side, #000 45%, transparent 100%);
	}

	.pre {
		position: relative;
		margin: 0;
		font-size: calc(6.6 * var(--u));
	}

	.card-stage {
		position: relative;
		width: calc(66 * var(--u));
		height: calc(86 * var(--u));
		margin-top: calc(4 * var(--u));
		perspective: 1200px;
		flex-shrink: 0;
	}

	.card {
		position: absolute;
		inset: 0;
		transform-style: preserve-3d;
	}

	.face {
		position: absolute;
		inset: 0;
		border-radius: calc(5 * var(--u));
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-shadow: 0 calc(3 * var(--u)) calc(10 * var(--u)) rgba(0, 0, 0, 0.5);
	}

	.back {
		background:
			repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0 calc(3 * var(--u)), transparent calc(3 * var(--u)) calc(6 * var(--u))),
			linear-gradient(160deg, #6a1cf6, #2a0a73);
		border: calc(1.4 * var(--u)) solid #fff;
	}

	.q {
		font-size: calc(50 * var(--u));
		color: #c6f432;
		text-shadow: calc(1.2 * var(--u)) calc(1.2 * var(--u)) 0 #0b0614;
	}

	.front {
		transform: rotateY(180deg);
		background: var(--c);
		color: var(--cfg);
		padding: calc(6 * var(--u));
		border: calc(1.4 * var(--u)) solid #fff;
	}

	.emblem-wrap {
		width: calc(34 * var(--u));
		height: calc(34 * var(--u));
		color: var(--cfg);
	}

	.emblem-wrap :global(svg) {
		width: 100%;
		height: 100%;
	}

	h2 {
		margin: calc(4 * var(--u)) 0 0;
		line-height: 0.9;
	}

	.tag {
		margin: calc(2.4 * var(--u)) 0 0;
		font-size: calc(4.8 * var(--u));
		line-height: 1.1;
	}

	.below {
		position: relative;
		margin-top: auto;
	}

	.why {
		margin: 0;
		font-size: calc(4.1 * var(--u));
		line-height: 1.35;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: calc(2 * var(--u));
		margin-top: calc(3 * var(--u));
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: calc(1.6 * var(--u));
		padding: calc(1.6 * var(--u)) calc(3.4 * var(--u));
		border-radius: 99px;
		background: color-mix(in srgb, var(--c) 20%, transparent);
		border: calc(0.4 * var(--u)) solid color-mix(in srgb, var(--c) 70%, transparent);
		font-size: calc(3.2 * var(--u));
	}

	.chip b {
		font-family: var(--font-display);
		font-size: calc(4.6 * var(--u));
		color: var(--c);
	}

	.runner {
		margin: calc(3 * var(--u)) 0 0;
		font-size: calc(3.6 * var(--u));
		opacity: 0.75;
	}
</style>
