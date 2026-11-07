<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import type { WrappedReport } from '$shared/report';
	import { prettyDate } from './format';

	interface Props {
		report: WrappedReport;
		hasMusic: boolean;
		onStart: (withSound: boolean) => void;
	}
	let { report, hasMusic, onStart }: Props = $props();

	let root: HTMLDivElement;
	let startBtn: HTMLButtonElement;
	// Buttons stay disabled until hydration so an early tap is never silently lost.
	let ready = $state(false);

	onMount(() => {
		ready = true;
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const c = gsap.context(() => {
			if (reduced) return;
			gsap.from('.g-line', { yPercent: 110, duration: 0.9, stagger: 0.08, ease: 'expo.out', delay: 0.15 });
			gsap.from('.g-shape', { scale: 0, rotate: -90, duration: 1.2, stagger: 0.1, ease: 'elastic.out(1, 0.6)' });
			gsap.from('.g-cta > *', { y: 30, opacity: 0, duration: 0.7, stagger: 0.1, delay: 0.6 });
			gsap.to('.g-shape.s1', { rotate: '+=360', duration: 30, repeat: -1, ease: 'none', delay: 1.3 });
			gsap.to('.g-shape.s2', { y: -18, duration: 2.6, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.5 });
			gsap.to('.g-shape.s3', { scale: 1.12, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.5 });
			gsap.to('.g-pulse', { scale: 1.35, opacity: 0, duration: 1.6, repeat: -1, ease: 'power2.out' });
		}, root);
		requestAnimationFrame(() => startBtn?.focus({ preventScroll: true }));
		return () => c.revert();
	});

	function start(withSound: boolean) {
		onStart(withSound);
	}
</script>

<div class="gate" bind:this={root}>
	<svg class="g-shape s1" viewBox="0 0 200 200" aria-hidden="true">
		<path
			d="M100 0l14 46 41-26-17 45 48-3-38 30 42 24-48 6 26 41-45-17 3 48-30-38-24 42-6-48-41 26 17-45-48 3 38-30-42-24 48-6-26-41 45 17-3-48 30 38z"
			fill="#c6f432"
		/>
	</svg>
	<div class="g-shape s2" aria-hidden="true"></div>
	<div class="g-shape s3" aria-hidden="true"></div>

	<div class="copy">
		<p class="kicker"><span class="g-line">Hey {report.userName},</span></p>
		<h1 class="display">
			<span class="mask"><span class="g-line">Your</span></span>
			<span class="mask"><span class="g-line year">{report.year}</span></span>
			<span class="mask"><span class="g-line outline">Wrapped</span></span>
			<span class="mask"><span class="g-line small">is ready.</span></span>
		</h1>
		{#if report.yearToDate}
			<p class="range"><span class="g-line">January 1 – {prettyDate(report.rangeEnd)} (so far)</span></p>
		{/if}
	</div>

	<div class="g-cta">
		<button class="start" bind:this={startBtn} onclick={() => start(true)} disabled={!ready}>
			<span class="g-pulse" aria-hidden="true"></span>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
			Unwrap with sound
		</button>
		<button class="silent" onclick={() => start(false)} disabled={!ready}>Start without sound</button>
		{#if !hasMusic}<p class="note">Best with sound on — it's got sound effects.</p>{/if}
	</div>
</div>

<style>
	.gate {
		--u: min(1cqw, 0.4625cqh);
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 14cqh calc(7 * var(--u)) 8cqh;
		background: radial-gradient(120% 80% at 80% 0%, #3a0f9e 0%, transparent 60%), radial-gradient(90% 60% at 0% 100%, #ff3ea533 0%, transparent 70%), #0b0614;
		color: #fff;
		overflow: hidden;
	}

	.g-shape {
		position: absolute;
		pointer-events: none;
	}

	.s1 {
		width: calc(62 * var(--u));
		right: calc(-18 * var(--u));
		top: calc(-8 * var(--u));
		opacity: 0.95;
	}

	.s2 {
		width: calc(30 * var(--u));
		height: calc(30 * var(--u));
		border-radius: 50%;
		background: #ff3ea5;
		right: calc(-9 * var(--u));
		bottom: 30cqh;
	}

	.s3 {
		width: calc(16 * var(--u));
		height: calc(16 * var(--u));
		border: calc(3 * var(--u)) solid #2de2e6;
		border-radius: 50%;
		right: calc(22 * var(--u));
		bottom: 44cqh;
	}

	.copy {
		position: relative;
	}

	.kicker {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(8 * var(--u));
		margin: 0 0 calc(3 * var(--u));
		overflow: hidden;
	}

	.kicker .g-line,
	.range .g-line {
		display: inline-block;
	}

	h1 {
		margin: 0;
		font-size: calc(21 * var(--u));
	}

	.mask {
		display: block;
		overflow: hidden;
		padding-bottom: 0.02em;
	}

	.mask > span {
		display: block;
	}

	.year {
		color: #c6f432;
		font-size: 1.25em;
	}

	/* Variable-font glyphs have overlapping contours; stroking them shows the overlaps.
	   Paint the stroke first and cover its inner half with a background-coloured fill. */
	.outline {
		color: #0e0719;
		-webkit-text-stroke: calc(1.2 * var(--u)) #fff;
		paint-order: stroke fill;
		letter-spacing: 0.015em;
	}

	.small {
		font-size: 0.5em;
		margin-top: 0.15em;
	}

	.range {
		margin: calc(4 * var(--u)) 0 0;
		font-size: calc(3.8 * var(--u));
		opacity: 0.75;
		overflow: hidden;
	}

	.g-cta {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(3 * var(--u));
	}

	.start {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: calc(2.5 * var(--u));
		width: 100%;
		justify-content: center;
		padding: calc(4.6 * var(--u)) calc(6 * var(--u));
		border: 0;
		border-radius: 99px;
		background: #c6f432;
		color: #0b0614;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(5.4 * var(--u));
		letter-spacing: -0.01em;
		cursor: pointer;
		box-shadow: 0 12px 40px -8px #c6f43288;
	}

	.start svg {
		width: calc(6.5 * var(--u));
		height: calc(6.5 * var(--u));
		fill: currentColor;
	}

	.g-pulse {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		border: 2px solid #c6f432;
		pointer-events: none;
	}

	.start:disabled,
	.silent:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.silent {
		border: 0;
		background: none;
		color: rgba(255, 255, 255, 0.72);
		font-size: calc(3.8 * var(--u));
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		padding: calc(2 * var(--u));
	}

	.note {
		margin: 0;
		font-size: calc(3.2 * var(--u));
		opacity: 0.55;
	}
</style>
