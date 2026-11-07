<script lang="ts">
	import { onMount } from 'svelte';
	import type { BingeSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp, offAbove, offRight, splitChars } from '../anim';
	import { clockTime, hoursMinutes, prettyDate } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: BingeSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let numEl: HTMLSpanElement;
	let typeEl: HTMLParagraphElement;

	const tiles = $derived(slide.episodeLabels.length ? slide.episodeLabels : Array.from({ length: slide.episodes }, (_, i) => `#${i + 1}`));
	const tileSize = $derived(tiles.length <= 12 ? 'l' : tiles.length <= 24 ? 'm' : 's');
	const lateNight = $derived(Number(slide.end.slice(11, 13)) < 6 && slide.end.slice(0, 10) !== slide.start.slice(0, 10));

	onMount(() => {
		const chars = splitChars(typeEl);
		s.timeline(root, (tl, q) => {
			tl.from(chars, { opacity: 0, duration: 0.01, stagger: 0.045, ease: 'none' }, 0.2)
				.add(() => s.sfx('tick'), 0.3)
				.from(q('.poster-wrap'), { x: offRight(root), rotate: 30, duration: 0.9, ease: 'back.out(1.4)' }, 0.6)
				.from(q('.hanger'), { rotate: -70, transformOrigin: '50% 0%', duration: 1.4, ease: 'elastic.out(1, 0.35)' }, 1.1)
				.from(q('.big'), { scale: 0.3, opacity: 0, duration: 0.7, ease: 'back.out(1.8)' }, 1.3);
			countUp(tl, numEl, slide.episodes, { at: 1.3, duration: 1.4, ease: 'power1.out', onTick: () => s.sfx('pop', { pitch: 0.7 + Math.random() * 0.6 }) });
			tl.from(q('.tile'), { y: offAbove(root), rotate: () => Math.random() * 40 - 20, opacity: 0, duration: 0.6, stagger: Math.min(0.12, 1.6 / tiles.length), ease: 'bounce.out' }, 1.4)
				.from(q('.when > *'), { y: 24, opacity: 0, duration: 0.5, stagger: 0.12 }, 3.2)
				.from(q('.verdict'), { scale: 0, rotate: -12, duration: 0.6, ease: 'back.out(2)' }, 4.2)
				.add(() => s.sfx('stamp'), 4.25);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="type" bind:this={typeEl}>Just one more episode…</p>

	<div class="poster-wrap">
		<Poster src={slide.series.poster} title={slide.series.title} year={slide.series.year} />
		<div class="hanger" aria-hidden="true"><span>Do not<br />disturb</span></div>
	</div>

	<div class="middle">
	<div class="big">
		<span class="num display" bind:this={numEl}>{slide.episodes}</span>
		<span class="lbl display">episodes<br /><em>one sitting</em></span>
	</div>

	<div class="tiles {tileSize}" aria-hidden="true">
		{#each tiles as label}<span class="tile">{label}</span>{/each}
	</div>
	</div>

	<div class="when">
		<p class="series display">{slide.series.title}</p>
		<p class="times">
			{prettyDate(slide.date)} · {clockTime(slide.start)} → {clockTime(slide.end)}{lateNight ? ' (the next day)' : ''}
		</p>
		<p class="dur">{hoursMinutes(slide.minutes)} of “I'll stop after this one.”</p>
	</div>
	<span class="verdict display">Respect.</span>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background:
			radial-gradient(70% 40% at 90% 10%, #4f6bff, transparent),
			#2448ff;
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.type {
		margin: 0;
		max-width: 60%;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(8.5 * var(--u));
		line-height: 1;
		color: #ffe14d;
	}

	.poster-wrap {
		position: absolute;
		top: 11cqh;
		right: calc(5 * var(--u));
		width: calc(30 * var(--u));
		transform: rotate(7deg);
	}

	.poster-wrap :global(.poster) {
		width: 100%;
		box-shadow: 0 calc(2 * var(--u)) 0 #0b0f5c;
	}

	.hanger {
		position: absolute;
		left: calc(-9 * var(--u));
		bottom: calc(-6 * var(--u));
		width: calc(22 * var(--u));
		padding: calc(5 * var(--u)) calc(1 * var(--u)) calc(2.4 * var(--u));
		border-radius: calc(3 * var(--u)) calc(3 * var(--u)) calc(1 * var(--u)) calc(1 * var(--u));
		background: #ffe14d;
		color: #14080a;
		text-align: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(3.4 * var(--u));
		line-height: 1;
		text-transform: uppercase;
		transform: rotate(-14deg);
		box-shadow: 0 calc(1 * var(--u)) 0 #0b0f5c;
	}

	.hanger::before {
		content: '';
		position: absolute;
		top: calc(1.4 * var(--u));
		left: 50%;
		width: calc(7 * var(--u));
		height: calc(3 * var(--u));
		margin-left: calc(-3.5 * var(--u));
		border-radius: 99px;
		background: #2448ff;
	}

	.middle {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 6cqh 0 4cqh;
	}

	.big {
		display: flex;
		align-items: center;
		gap: calc(3 * var(--u));
	}

	.num {
		font-size: calc(40 * var(--u));
		line-height: 0.78;
		color: #ffe14d;
	}

	.lbl {
		font-size: calc(8 * var(--u));
		line-height: 0.95;
	}

	.lbl em {
		font-style: normal;
		color: #ffe14d;
		font-size: 0.7em;
	}

	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: calc(1.4 * var(--u));
		margin-top: calc(4 * var(--u));
		align-content: flex-start;
	}

	.tile {
		display: grid;
		place-items: center;
		border-radius: calc(1.6 * var(--u));
		background: #fff;
		color: #2448ff;
		font-weight: 800;
		box-shadow: 0 calc(0.8 * var(--u)) 0 #0b0f5c;
	}

	.l .tile {
		width: calc(19.5 * var(--u));
		height: calc(9 * var(--u));
		font-size: calc(3.6 * var(--u));
	}
	.m .tile {
		width: calc(13.5 * var(--u));
		height: calc(6.4 * var(--u));
		font-size: calc(2.8 * var(--u));
	}
	.s .tile {
		width: calc(9.5 * var(--u));
		height: calc(5 * var(--u));
		font-size: calc(2.2 * var(--u));
	}

	.when {
		padding-right: calc(30 * var(--u));
	}

	.when p {
		margin: 0;
	}

	.series {
		font-size: calc(8 * var(--u));
		line-height: 0.95;
	}

	.times {
		margin-top: calc(1.6 * var(--u)) !important;
		font-size: calc(4 * var(--u));
		font-weight: 600;
	}

	.dur {
		font-size: calc(4 * var(--u));
		opacity: 0.8;
	}

	.verdict {
		position: absolute;
		right: calc(5 * var(--u));
		bottom: 6cqh;
		padding: calc(2 * var(--u)) calc(4 * var(--u));
		border: calc(1 * var(--u)) solid #ffe14d;
		border-radius: calc(2 * var(--u));
		color: #ffe14d;
		font-size: calc(8 * var(--u));
		transform: rotate(-10deg);
	}
</style>
