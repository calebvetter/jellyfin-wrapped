<script lang="ts">
	import { onMount } from 'svelte';
	import type { RequestsSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp, offAbove } from '../anim';
	import { plural } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: RequestsSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let totalEl: HTMLSpanElement;

	const gt = $derived(slide.goodTaste);
	const hit = $derived(new Set(gt.examples.map((e) => e.key)));
	const shown = $derived(slide.posters.slice(0, 8));

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.big'), { scale: 0.4, opacity: 0, duration: 0.7, ease: 'back.out(2)' }, 0.3);
			countUp(tl, totalEl, slide.total, { at: 0.3, duration: 1.2 });
			tl.from(q('.split'), { y: 20, opacity: 0, duration: 0.5 }, 1.1)
				.from(q('.card'), { y: offAbove(root), x: () => Math.random() * 120 - 60, rotate: () => Math.random() * 90 - 45, duration: 0.7, stagger: 0.09, ease: 'power3.out' }, 1.2)
				.add(() => s.sfx('pop'), 1.3)
				// ---- Good Taste reveal: a short beat after the last poster lands (~2.6 s)
				.add(() => s.sfx('drumroll'), 2.9)
				.to(q('.card:not(.hit)'), { opacity: 0.28, scale: 0.92, filter: 'grayscale(1)', duration: 0.5 }, 3.5)
				.to(q('.card.hit'), { scale: 1.08, duration: 0.5, ease: 'back.out(3)' }, 3.5)
				.from(q('.taste'), { yPercent: 120, duration: 0.8, ease: 'expo.out' }, 3.9)
				.from(q('.badge'), { scale: 3, rotate: -45, opacity: 0, duration: 0.35, ease: 'power4.in' }, 4.4)
				.add(() => s.sfx('stamp'), 4.72)
				.from(q('.taste-copy > *'), { y: 20, opacity: 0, duration: 0.5, stagger: 0.12 }, 4.9);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">You asked. The server delivered.</p>
	<div class="big">
		<span class="num display" bind:this={totalEl}>{slide.total}</span>
		<span class="lbl display">titles<br />requested</span>
	</div>
	<p class="split">{plural(slide.movies, 'movie')} · {plural(slide.shows, 'show')}</p>

	<div class="cards">
		{#each shown as p, i (p.key)}
			<div class="card" class:hit={hit.has(p.key)} style:--r="{((i * 37) % 13) - 6}deg">
				<Poster src={p.poster} title={p.title} year={p.year} />
			</div>
		{/each}
	</div>

	<div class="taste">
		<svg class="badge" viewBox="0 0 120 120" aria-hidden="true">
			<path d="M60 4l12 14 18-4 4 18 16 10-8 16 8 16-16 10-4 18-18-4-12 14-12-14-18 4-4-18-16-10 8-16-8-16 16-10 4-18 18 4z" fill="#c6f432" stroke="#1a0a4a" stroke-width="4" />
			<text x="60" y="56" text-anchor="middle" font-size="17" font-weight="900" fill="#1a0a4a" font-family="var(--font-display)">GOOD</text>
			<text x="60" y="76" text-anchor="middle" font-size="17" font-weight="900" fill="#1a0a4a" font-family="var(--font-display)">TASTE</text>
		</svg>
		<div class="taste-copy">
			{#if gt.titles > 0}
				<p class="t1 display">{gt.titles} of your picks</p>
				<p class="t2">got watched by <strong>{plural(gt.viewers, 'other person', 'other people')}</strong> after you asked for them. You're basically the server's programming director.</p>
			{:else}
				<p class="t1 display">Ahead of the curve</p>
				<p class="t2">Nobody else has watched your picks… yet. Visionaries are rarely appreciated in their own time.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 0;
		background: #c9b6ff;
		color: #1a0a4a;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(6.4 * var(--u));
	}

	.big {
		display: flex;
		align-items: flex-end;
		gap: calc(3 * var(--u));
		margin-top: calc(2 * var(--u));
	}

	.num {
		font-size: calc(34 * var(--u));
		line-height: 0.78;
		color: #6a1cf6;
	}

	.lbl {
		font-size: calc(8 * var(--u));
		line-height: 0.92;
		padding-bottom: calc(1 * var(--u));
	}

	.split {
		margin: calc(2 * var(--u)) 0 0;
		font-size: calc(4.4 * var(--u));
		font-weight: 700;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: calc(2.4 * var(--u));
		margin-top: calc(4 * var(--u));
	}

	.card {
		transform: rotate(var(--r));
	}

	.card :global(.poster) {
		width: 100%;
		box-shadow: 0 calc(1 * var(--u)) 0 #1a0a4a;
	}

	.card.hit :global(.poster) {
		box-shadow:
			0 0 0 calc(1 * var(--u)) #c6f432,
			0 calc(1.4 * var(--u)) 0 calc(0.6 * var(--u)) #1a0a4a;
	}

	.taste {
		position: relative;
		margin-top: auto;
		padding: calc(7 * var(--u)) calc(6 * var(--u)) 8cqh;
		margin-left: calc(-6 * var(--u));
		margin-right: calc(-6 * var(--u));
		background: #1a0a4a;
		color: #fff;
		border-radius: calc(8 * var(--u)) calc(8 * var(--u)) 0 0;
	}

	.badge {
		position: absolute;
		right: calc(4 * var(--u));
		top: calc(-15 * var(--u));
		width: calc(30 * var(--u));
		height: calc(30 * var(--u));
		transform: rotate(12deg);
	}

	.t1 {
		margin: 0;
		font-size: calc(10.5 * var(--u));
		color: #c6f432;
		max-width: 70%;
	}

	.t2 {
		margin: calc(2 * var(--u)) 0 0;
		font-size: calc(4.3 * var(--u));
		line-height: 1.35;
	}

	.t2 strong {
		color: #c9b6ff;
	}
</style>
