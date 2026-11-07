<script lang="ts">
	import { onMount } from 'svelte';
	import type { ClockSlide } from '$shared/report';
	import { story } from '../context';
	import { hourLabel, pct, seeded } from '../format';
	import Emblem from '../Emblem.svelte';

	let { slide }: { slide: ClockSlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const WINDOWS: Record<string, number> = { 'early-bird': 5, 'daytime-drifter': 9, 'afternoon-escapist': 13, 'prime-time': 17, 'night-owl': 21, 'midnight-gremlin': 1 };
	const TAGLINES: Record<string, string> = {
		'early-bird': 'Sunrise and a screen. Bold.',
		'daytime-drifter': 'Who needs a lunch break when there are episodes?',
		'afternoon-escapist': 'The afternoon slump never stood a chance.',
		'prime-time': 'Dinner, then the main event. A classic.',
		'night-owl': 'Your best viewing happens after dark.',
		'midnight-gremlin': 'Sleep is for people without a watchlist.'
	};
	const start = $derived(WINDOWS[slide.persona] ?? 0);
	const max = $derived(Math.max(1, ...slide.hourly));
	const inWindow = (h: number) => (h - start + 24) % 24 < 4;
	const dark = $derived(['night-owl', 'midnight-gremlin'].includes(slide.persona));

	// geometry: 24 bars radiating out from an inner ring; 0h at the top
	const R0 = 52;
	const R1 = 128;
	const bar = (h: number, v: number) => {
		const a = ((h + 0.5) / 24) * Math.PI * 2 - Math.PI / 2;
		const len = 6 + (v / max) * (R1 - R0);
		return { x1: Math.cos(a) * R0, y1: Math.sin(a) * R0, x2: Math.cos(a) * (R0 + len), y2: Math.sin(a) * (R0 + len) };
	};
	const arc = $derived.by(() => {
		const a0 = (start / 24) * Math.PI * 2 - Math.PI / 2;
		const a1 = ((start + 4) / 24) * Math.PI * 2 - Math.PI / 2;
		const r = R1 + 14;
		return `M${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r}`;
	});
	const stars = Array.from({ length: 40 }, (_, i) => {
		const r = seeded(`star${i}`);
		return { x: r() * 100, y: r() * 100, s: 1 + r() * 2.5, d: r() * 3 };
	});

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.dial'), { scale: 0.6, rotate: -120, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0.2)
				.from(q('.hb'), { attr: { x2: (_i: number, el: Element) => Number(el.getAttribute('x1')), y2: (_i: number, el: Element) => Number(el.getAttribute('y1')) } as gsap.TweenVars['attr'], duration: 0.6, stagger: 0.05, ease: 'back.out(1.6)' }, 0.6)
				.add(() => s.sfx('sparkle'), 0.7)
				.from(q('.window'), { strokeDashoffset: 1, duration: 0.9, ease: 'power2.inOut' }, 1.9)
				.from(q('.center-emblem'), { scale: 0, rotate: -30, duration: 0.9, ease: 'elastic.out(1, 0.5)' }, 2.1)
				.add(() => s.sfx('reveal'), 2.2)
				.from(q('.youre'), { y: 20, opacity: 0, duration: 0.5 }, 2.6)
				.from(q('.persona'), { yPercent: 100, opacity: 0, duration: 0.8, ease: 'expo.out' }, 2.75)
				.from(q('.detail > *'), { y: 20, opacity: 0, duration: 0.5, stagger: 0.12 }, 3.4);
		});
		s.timeline(root, (tl, q) => {
			q('.star').forEach((st, i) => tl.to(st, { opacity: 0.2, duration: 1 + (i % 5) * 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }, (i % 7) * 0.3));
		});
	});
</script>

<div class="slide" class:dark bind:this={root}>
	<div class="sky" aria-hidden="true">
		{#each stars as st}<i class="star" style:left="{st.x}%" style:top="{st.y}%" style:width="{st.s}px" style:height="{st.s}px"></i>{/each}
	</div>

	<p class="kicker serif">Your viewing, around the clock</p>

	<div class="center">
	<div class="dial-wrap">
		<svg class="dial" viewBox="-178 -178 356 356" role="img" aria-label="Minutes watched by hour of day">
			<circle r={R0 - 6} fill="rgba(255,255,255,0.06)" />
			<circle r={R1 + 2} fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 6" />
			<path class="window" d={arc} pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" fill="none" stroke="#ffe14d" stroke-width="7" stroke-linecap="round" />
			{#each slide.hourly as v, h}
				{@const b = bar(h, v)}
				<line class="hb" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={inWindow(h) ? '#ffe14d' : '#2de2e6'} stroke-opacity={inWindow(h) ? 1 : 0.55} stroke-width="8" stroke-linecap="round" />
			{/each}
			{#each [0, 6, 12, 18] as h}
				{@const a = (h / 24) * Math.PI * 2 - Math.PI / 2}
				<text x={Math.cos(a) * 150} y={Math.sin(a) * 150 + 4} text-anchor="middle" font-size="12" font-weight="700" fill="rgba(255,255,255,0.6)">{hourLabel(h)}</text>
			{/each}
		</svg>
		<div class="center-emblem"><Emblem id={slide.persona} /></div>
	</div>

	<p class="youre">You're</p>
	<div class="mask"><h2 class="persona display">{slide.personaTitle}</h2></div>
	<div class="detail">
		<p>{TAGLINES[slide.persona]}</p>
		<p class="stat"><strong>{pct(slide.windowShare)}</strong> of your watching happened between {hourLabel(start)} and {hourLabel((start + 4) % 24)}. Peak hour: <strong>{hourLabel(slide.peakHour)}</strong>.</p>
	</div>
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 6cqh;
		background: radial-gradient(90% 60% at 50% 40%, #1a2a7a, #08123d 70%);
		color: #fff;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		overflow: hidden;
	}

	.slide:not(.dark) {
		background: radial-gradient(90% 60% at 50% 40%, #2b6dff, #0f2d8c 75%);
	}

	.sky {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.star {
		position: absolute;
		border-radius: 50%;
		background: #fff;
	}

	.kicker {
		position: relative;
		margin: 0;
		font-size: calc(6 * var(--u));
		color: #2de2e6;
	}

	.dial-wrap {
		position: relative;
		width: calc(92 * var(--u));
		height: calc(92 * var(--u));
	}

	.dial {
		width: 100%;
		height: 100%;
	}

	.center-emblem {
		position: absolute;
		left: 50%;
		top: 50%;
		width: calc(24 * var(--u));
		height: calc(24 * var(--u));
		margin: calc(-12 * var(--u)) 0 0 calc(-12 * var(--u));
		color: #fff;
	}

	.center-emblem :global(svg) {
		width: 100%;
		height: 100%;
	}

	.youre {
		position: relative;
		margin: 1cqh 0 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(6 * var(--u));
	}

	.mask {
		overflow: hidden;
	}

	.persona {
		position: relative;
		margin: 0;
		font-size: calc(12.5 * var(--u));
		color: #ffe14d;
	}

	.center {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.detail {
		position: relative;
		margin-top: calc(4 * var(--u));
	}

	.detail p {
		margin: 0 0 calc(1.6 * var(--u));
		font-size: calc(4.2 * var(--u));
		line-height: 1.3;
	}

	.stat {
		opacity: 0.85;
	}

	.stat strong {
		color: #ffe14d;
	}
</style>
