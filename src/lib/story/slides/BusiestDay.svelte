<script lang="ts">
	import { onMount } from 'svelte';
	import type { BusiestDaySlide } from '$shared/report';
	import { story } from '../context';
	import { countUp, offAbove, offBelow } from '../anim';
	import { hoursMinutes, parseDay, seeded } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: BusiestDaySlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let hoursEl: HTMLSpanElement;

	const day = $derived(parseDay(slide.date));
	const rnd = $derived(seeded(slide.date));
	const tilts = $derived(slide.titles.map(() => rnd() * 16 - 8));
	const cols = $derived(slide.titles.length <= 4 ? slide.titles.length : 3);

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.cal'), { y: offAbove(root), rotate: -15, duration: 0.9, ease: 'back.out(1.3)' }, 0.25)
				.add(() => s.sfx('thud'), 0.7)
				.to(q('.tear'), { rotate: 28, y: 420, x: 80, opacity: 0, duration: 1.1, ease: 'power2.in' }, 1.1)
				.add(() => s.sfx('whoosh'), 1.1)
				.from(q('.cal .daynum'), { scale: 1.6, duration: 0.6, ease: 'back.out(2.5)' }, 1.2)
				.from(q('.total'), { x: -40, opacity: 0, duration: 0.6 }, 1.8);
			countUp(tl, hoursEl, slide.minutes, { at: 1.9, duration: 1.6, format: (n) => hoursMinutes(n) });
			tl.from(q('.pol'), { y: offBelow(root), rotate: (i: number) => (i % 2 ? 40 : -40), opacity: 0, duration: 0.8, stagger: 0.18, ease: 'back.out(1.4)' }, 2.6).add(
				() => s.sfx('pop'),
				2.7
			);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">Your busiest day of the year</p>

	<div class="cal-stack">
		<div class="cal tear" aria-hidden="true">
			<div class="cal-top">{day.month}</div>
			<div class="daynum display">{day.day > 1 ? day.day - 1 : 31}</div>
		</div>
		<div class="cal">
			<div class="cal-top">{day.month}</div>
			<div class="daynum display">{day.day}</div>
			<div class="weekday">{slide.weekday}</div>
		</div>
	</div>

	<p class="total"><span class="display" bind:this={hoursEl}>{hoursMinutes(slide.minutes)}</span> of pure screen time.</p>

	<div class="pols" style:--cols={cols}>
		{#each slide.titles as t, i (t.key)}
			<figure class="pol" style:--r="{tilts[i]}deg">
				<Poster src={t.poster} title={t.title} year={t.year} />
				<figcaption>
					<span class="pt">{t.title}</span>
					<span class="pm">{t.episodes > 0 ? `${t.episodes} ep · ` : ''}{hoursMinutes(t.minutes)}</span>
				</figcaption>
			</figure>
		{/each}
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: #ff3ea5;
		color: #14080a;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(6.6 * var(--u));
	}

	.cal-stack {
		position: relative;
		width: calc(56 * var(--u));
		height: calc(56 * var(--u));
		margin: calc(4 * var(--u)) auto 0;
	}

	.cal {
		position: absolute;
		inset: 0;
		border-radius: calc(4 * var(--u));
		background: #fff6e6;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		box-shadow: 0 calc(2 * var(--u)) 0 #14080a;
		transform: rotate(-3deg);
	}

	.tear {
		z-index: 2;
		transform-origin: 0 0;
	}

	.cal-top {
		width: 100%;
		padding: calc(2.4 * var(--u)) 0;
		background: #14080a;
		color: #fff6e6;
		text-align: center;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(6.4 * var(--u));
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.daynum {
		font-size: calc(30 * var(--u));
		line-height: 1;
		margin-top: calc(1 * var(--u));
		color: #ff2d3d;
	}

	.weekday {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(6 * var(--u));
		margin-top: calc(-2 * var(--u));
	}

	.total {
		margin: calc(5 * var(--u)) 0 0;
		font-size: calc(5 * var(--u));
		font-weight: 600;
		text-align: center;
	}

	.total .display {
		display: block;
		font-size: calc(17 * var(--u));
		line-height: 0.95;
		color: #fff6e6;
		text-shadow: calc(0.7 * var(--u)) calc(0.7 * var(--u)) 0 #14080a;
	}

	.pols {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: calc(3 * var(--u));
		margin-top: auto;
		padding: 0 calc(2 * var(--u));
	}

	.pol {
		min-width: 0;
		margin: 0;
		padding: calc(1.6 * var(--u)) calc(1.6 * var(--u)) calc(2.4 * var(--u));
		background: #fff;
		border-radius: calc(1 * var(--u));
		transform: rotate(var(--r));
		box-shadow: 0 calc(1.4 * var(--u)) calc(3 * var(--u)) rgba(20, 8, 10, 0.25);
	}

	.pol :global(.poster) {
		width: 100%;
		border-radius: calc(0.6 * var(--u));
	}

	figcaption {
		display: flex;
		flex-direction: column;
		margin-top: calc(1.4 * var(--u));
	}

	.pt {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(3 * var(--u));
		line-height: 1.05;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.pm {
		font-size: calc(2.6 * var(--u));
		opacity: 0.6;
	}
</style>
