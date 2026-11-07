<script lang="ts">
	import { onMount } from 'svelte';
	import type { TotalTimeSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp } from '../anim';
	import { fmt, plural, timeComparison } from '../format';

	let { slide }: { slide: TotalTimeSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let num: HTMLSpanElement;

	const big = $derived(slide.hours >= 1 ? slide.hours : slide.minutes);
	const unit = $derived(slide.hours >= 1 ? (slide.hours === 1 ? 'hour' : 'hours') : 'minutes');
	const comparison = $derived(timeComparison(slide.minutes / 60));
	// One pill per day of watch time — never truncated. Long rows flow down behind the
	// movie/episode stickers and fade out. The last pill is filled to the fractional day.
	const pills = $derived(Math.max(1, Math.ceil(slide.days)));
	const lastFill = $derived(slide.days - Math.floor(slide.days) || 1);

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.7 }, 0.1)
				.from(q('.numwrap'), { scale: 0.4, rotate: -8, opacity: 0, duration: 0.9, ease: 'back.out(1.6)' }, 0.3);
			countUp(tl, num, big, { duration: 2.2, at: 0.35, ease: 'expo.out', onTick: () => s.sfx('tick', { pitch: 0.8 + Math.random() * 0.4 }) });
			tl.from(q('.unit'), { xPercent: -60, opacity: 0, duration: 0.7 }, 1)
				.from(q('.days-line'), { y: 24, opacity: 0, duration: 0.6 }, 2.4)
				.from(q('.pill'), { scaleX: 0, transformOrigin: '0 50%', duration: 0.35, stagger: { amount: Math.min(1.8, pills * 0.06) }, ease: 'power2.out' }, 2.6)
				.from(q('.sticker'), { scale: 0, rotate: (i) => (i ? 25 : -25), duration: 0.8, stagger: 0.18, ease: 'elastic.out(1, 0.55)' }, 3.4)
				.add(() => s.sfx('pop'), 3.45)
				.add(() => s.sfx('pop', { pitch: 1.25 }), 3.63)
				.from(q('.compare'), { y: 20, opacity: 0, duration: 0.6 }, 4.4);
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.burst'), { rotate: 360, duration: 40, ease: 'none', repeat: -1 }, 0);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<svg class="burst" viewBox="-100 -100 200 200" aria-hidden="true">
		{#each Array.from({ length: 18 }) as _, i}
			<path d="M0 0 L{Math.cos((i / 18) * Math.PI * 2) * 100} {Math.sin((i / 18) * Math.PI * 2) * 100} L{Math.cos(((i + 0.5) / 18) * Math.PI * 2) * 100} {Math.sin(((i + 0.5) / 18) * Math.PI * 2) * 100}Z" />
		{/each}
	</svg>

	<p class="kicker serif">This year you spent</p>

	<div class="numwrap">
		<span class="num display" bind:this={num}>{fmt(big)}</span>
		<span class="unit display">{unit}</span>
	</div>

	<p class="days-line">watching stuff. That's <strong>{slide.days >= 1 ? `${fmt(slide.days)} ${slide.days === 1 ? 'day' : 'days'}` : 'most of a day'}</strong>, non-stop.</p>
	<div class="pills" aria-hidden="true">
		{#each Array.from({ length: pills }) as _, i}
			<span class="pill" style:--f={i === pills - 1 ? lastFill : 1}></span>
		{/each}
	</div>

	<div class="stickers">
		{#if slide.movies > 0}
			<div class="sticker s-movies"><span class="display">{fmt(slide.movies)}</span>{slide.movies === 1 ? 'movie' : 'movies'}</div>
		{/if}
		{#if slide.episodes > 0}
			<div class="sticker s-eps"><span class="display">{fmt(slide.episodes)}</span>{slide.episodes === 1 ? 'episode' : 'episodes'}</div>
		{/if}
	</div>

	{#if comparison}<p class="compare">{comparison}</p>{/if}
	<p class="sr-only">
		You spent {plural(slide.hours, 'hour')} watching: {plural(slide.movies, 'movie')} and {plural(slide.episodes, 'episode')} across {plural(slide.series, 'series', 'series')}.
	</p>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 15cqh calc(7 * var(--u)) 7cqh;
		background: #c6f432;
		color: #0b0614;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Rays stay inside the viewBox (a circle), sized well past the frame corners and
	   softly faded toward their tips — no hard edges at any frame size. */
	.burst {
		position: absolute;
		width: calc(340 * var(--u));
		height: calc(340 * var(--u));
		left: 50%;
		top: 46%;
		margin: calc(-170 * var(--u)) 0 0 calc(-170 * var(--u));
		fill: #b3e219;
		pointer-events: none;
		mask-image: radial-gradient(closest-side, #000 30%, transparent 100%);
	}

	.kicker {
		position: relative;
		margin: 0;
		font-size: calc(8.5 * var(--u));
	}

	.numwrap {
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: calc(2 * var(--u));
		margin-top: 1cqh;
	}

	.num {
		font-size: calc(44 * var(--u));
		line-height: 0.8;
		letter-spacing: -0.045em;
		color: #0b0614;
	}

	.unit {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-size: calc(9 * var(--u));
		color: #6a1cf6;
		padding-bottom: calc(1 * var(--u));
	}

	.days-line {
		position: relative;
		margin: 3cqh 0 0;
		font-size: calc(5.6 * var(--u));
		line-height: 1.25;
		max-width: 90%;
	}

	.days-line strong {
		background: #0b0614;
		color: #c6f432;
		padding: 0 0.25em;
		border-radius: 0.2em;
		white-space: nowrap;
	}

	/* Fills the space down to the stickers and continues a little behind them; rows fade
	   out as they approach the circles, so any number of days reads as "and on and on". */
	.pills {
		position: relative;
		flex: 1 1 0;
		min-height: calc(5 * var(--u));
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: calc(1.6 * var(--u));
		margin-top: calc(3 * var(--u));
		margin-bottom: calc(-16 * var(--u));
		overflow: hidden;
		mask-image: linear-gradient(to bottom, #000 calc(100% - calc(30 * var(--u))), transparent calc(100% - calc(6 * var(--u))));
	}

	.pill {
		width: calc(9 * var(--u));
		height: calc(4.4 * var(--u));
		border-radius: 99px;
		border: calc(0.6 * var(--u)) solid #0b0614;
		background: linear-gradient(90deg, #0b0614 calc(var(--f) * 100%), transparent calc(var(--f) * 100%));
	}

	.stickers {
		position: relative;
		z-index: 1;
		display: flex;
		gap: calc(4 * var(--u));
		margin-bottom: 4cqh;
	}

	.sticker {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: calc(38 * var(--u));
		height: calc(38 * var(--u));
		border-radius: 50%;
		font-weight: 700;
		font-size: calc(4.6 * var(--u));
		text-transform: uppercase;
		letter-spacing: 0.04em;
		box-shadow: 0 calc(1.6 * var(--u)) 0 #0b0614;
	}

	.sticker .display {
		font-size: calc(15 * var(--u));
		line-height: 0.85;
	}

	.s-movies {
		background: #ff3ea5;
		color: #0b0614;
		transform: rotate(-8deg);
	}

	.s-eps {
		background: #6a1cf6;
		color: #fff;
		transform: rotate(7deg) translateY(calc(4 * var(--u)));
	}

	.compare {
		position: relative;
		margin: 0;
		font-size: calc(4.4 * var(--u));
		font-weight: 600;
		max-width: 88%;
	}
</style>
