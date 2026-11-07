<script lang="ts">
	import { onMount } from 'svelte';
	import type { IntroSlide } from '$shared/report';
	import { story } from '../context';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: IntroSlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const posters = $derived(slide.posters.length ? slide.posters : []);
	const cols = $derived([0, 1, 2].map((c) => (posters.length ? Array.from({ length: 6 }, (_, i) => posters[(c * 2 + i) % posters.length]) : [])));
	const digits = String(s.report.year).split('');

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.col'), { yPercent: (i) => (i % 2 ? -30 : 30), opacity: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out' }, 0)
				.from(q('.l1, .l2'), { yPercent: 115, duration: 0.8, stagger: 0.1, ease: 'expo.out' }, 0.2)
				.add(() => s.sfx('pop'), 0.3)
				.from(q('.digit'), { yPercent: 120, rotate: (i) => (i % 2 ? 12 : -12), duration: 1, stagger: 0.09, ease: 'back.out(1.8)' }, 0.55)
				.add(() => s.sfx('reveal'), 0.7)
				.from(q('.sticker'), { scale: 0, rotate: -120, duration: 0.9, ease: 'elastic.out(1, 0.5)' }, 1.1)
				.from(q('.foot'), { y: 20, opacity: 0, duration: 0.6 }, 1.4)
				.to(q('.digit'), { y: '-0.06em', duration: 0.25, stagger: { each: 0.06, yoyo: true, repeat: 1 }, ease: 'sine.inOut' }, 2.2);
		});
		s.timeline(root, (tl, q) => {
			q('.col').forEach((c, i) => tl.to(c, { yPercent: i % 2 ? 18 : -18, duration: 14, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0));
			tl.to(q('.sticker'), { rotate: 360, duration: 18, ease: 'none', repeat: -1 }, 0);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<div class="wall" aria-hidden="true">
		{#each cols as col, c}
			<div class="col">
				{#each col as src, i}
					<Poster {src} title="poster {c}-{i}" class="wp" />
				{/each}
			</div>
		{/each}
	</div>
	<div class="fade" aria-hidden="true"></div>

	<div class="sticker" aria-hidden="true">
		<svg viewBox="0 0 200 200">
			<defs><path id="circ" d="M100,100 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" /></defs>
			<circle cx="100" cy="100" r="96" fill="#ff3ea5" />
			<text font-family="var(--font-display)" font-weight="800" font-size="21" letter-spacing="3" fill="#0b0614">
				<textPath href="#circ">{s.report.userName.toUpperCase()} • YEAR ON SCREEN •</textPath>
			</text>
			<path d="M100 70l9 21 23 2-17 15 5 22-20-12-20 12 5-22-17-15 23-2z" fill="#0b0614" />
		</svg>
	</div>

	<div class="type">
		<h2 class="display">
			<span class="mask"><span class="l1">Let's</span></span>
			<span class="mask"><span class="l2">rewind</span></span>
			<span class="mask year" aria-label={String(s.report.year)}>
				{#each digits as d}<span class="digit">{d}</span>{/each}
			</span>
		</h2>
		<p class="foot serif">Grab the popcorn. Tap through, or hold to pause.</p>
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		background: #0b0614;
		color: #fff;
		overflow: hidden;
	}

	.wall {
		position: absolute;
		top: -12cqh;
		right: calc(-18 * var(--u));
		width: calc(92 * var(--u));
		height: 130cqh;
		display: flex;
		gap: calc(3 * var(--u));
		transform: rotate(-10deg);
	}

	.col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: calc(3 * var(--u));
	}

	.col:nth-child(2) {
		margin-top: -14cqh;
	}

	.col :global(.wp) {
		width: 100%;
		border-radius: calc(2.4 * var(--u));
		box-shadow: 0 calc(2 * var(--u)) calc(6 * var(--u)) rgba(0, 0, 0, 0.5);
	}

	.fade {
		position: absolute;
		inset: 0;
		background: linear-gradient(200deg, transparent 20%, rgba(11, 6, 20, 0.7) 52%, #0b0614 78%);
	}

	.sticker {
		position: absolute;
		top: 13cqh;
		left: calc(6 * var(--u));
		width: calc(30 * var(--u));
		height: calc(30 * var(--u));
		filter: drop-shadow(0 calc(2 * var(--u)) calc(4 * var(--u)) rgba(0, 0, 0, 0.45));
	}

	.sticker svg {
		width: 100%;
		height: 100%;
	}

	.type {
		position: absolute;
		left: calc(6 * var(--u));
		right: calc(6 * var(--u));
		bottom: 8cqh;
	}

	h2 {
		margin: 0;
		font-size: calc(22 * var(--u));
	}

	.mask {
		display: block;
		overflow: hidden;
		padding: 0.04em 0 0.02em;
	}

	.mask > span {
		display: inline-block;
	}

	/* Variable-font glyphs have overlapping contours; stroking them shows the overlaps.
	   Paint the stroke first and cover its inner half with a background-coloured fill. */
	.l2 {
		color: #0b0614;
		-webkit-text-stroke: calc(1.1 * var(--u)) #fff;
		paint-order: stroke fill;
		letter-spacing: 0.015em;
	}

	.year {
		font-size: 1.62em;
		color: #c6f432;
		line-height: 0.82;
		letter-spacing: -0.04em;
	}

	.foot {
		margin: calc(3 * var(--u)) 0 0;
		font-size: calc(5.4 * var(--u));
		opacity: 0.85;
	}
</style>
