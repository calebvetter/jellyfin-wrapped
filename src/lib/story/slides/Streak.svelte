<script lang="ts">
	import { onMount } from 'svelte';
	import type { StreakSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp } from '../anim';
	import { fmt, hoursMinutes, shortDate } from '../format';

	let { slide }: { slide: StreakSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let numEl: HTMLSpanElement;

	const PER_ROW = 21;
	const COLORS = ['rgba(255,255,255,0.07)', '#1f6b4f', '#2f9a6c', '#4fd18b', '#c6f432'];
	const inStreak = (i: number) => i >= slide.streakStartIndex && i < slide.streakStartIndex + slide.days;

	onMount(() => {
		s.timeline(root, (tl, q) => {
			const cells = q('.cell');
			const streakCells = cells.filter((c) => (c as HTMLElement).dataset.streak === '1');
			const others = cells.filter((c) => (c as HTMLElement).dataset.streak !== '1');
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(cells, { scale: 0, duration: 0.3, stagger: { each: 0.0025, from: 'start' }, ease: 'back.out(2)' }, 0.2)
				.set(others, { opacity: 0.55 }, 1.2)
				.to(streakCells, { backgroundColor: '#ff6a13', boxShadow: '0 0 1.8cqw #ff6a13', scale: 1.25, duration: 0.25, stagger: Math.min(0.06, 1.8 / Math.max(1, slide.days)), ease: 'back.out(3)' }, 1.3)
				.to(streakCells, { scale: 1, duration: 0.3, stagger: Math.min(0.06, 1.8 / Math.max(1, slide.days)) }, 1.55)
				.add(() => s.sfx('sparkle'), 1.3)
				.from(q('.flame'), { scale: 0, y: 40, duration: 0.9, ease: 'elastic.out(1, 0.5)' }, 1.6)
				.from(q('.big'), { scale: 0.4, opacity: 0, duration: 0.6, ease: 'back.out(2)' }, 1.7);
			countUp(tl, numEl, slide.days, { at: 1.7, duration: 1.5, onTick: () => s.sfx('tick', { pitch: 1.2 }) });
			tl.from(q('.facts > *'), { y: 20, opacity: 0, duration: 0.5, stagger: 0.12 }, 3.2);
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.flame .inner'), { scaleY: 1.12, scaleX: 0.92, transformOrigin: '50% 100%', duration: 0.35, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">Your longest streak</p>

	<div class="head">
		<svg class="flame" viewBox="0 0 100 130" aria-hidden="true">
			<path d="M50 4c8 26 40 40 40 78a40 40 0 01-80 0c0-20 10-30 18-38 2 14 8 20 14 22-6-24 0-46 8-62z" fill="#ff6a13" />
			<path class="inner" d="M50 60c4 14 22 22 22 42a22 22 0 01-44 0c0-12 8-18 12-22 2 8 6 10 8 12-2-12 0-22 2-32z" fill="#ffe14d" />
		</svg>
		<div class="big">
			<span class="num display" bind:this={numEl}>{slide.days}</span>
			<span class="lbl display">days<br />in a row</span>
		</div>
	</div>

	<div class="grid" style:--per={PER_ROW} role="img" aria-label="Daily viewing across the year with your {slide.days}-day streak highlighted">
		{#each slide.heat as level, i}
			<i class="cell" data-streak={inStreak(i) ? '1' : '0'} style:background={COLORS[level]}></i>
		{/each}
	</div>
	<p class="legend">Every square is a day. The orange ones? That was you, every single day.</p>

	<div class="facts">
		<p class="range display">{shortDate(slide.start)} → {shortDate(slide.end)}</p>
		<p>{hoursMinutes(slide.minutes)} watched across {fmt(slide.titleCount)} titles. You showed up on <strong>{fmt(slide.activeDays)} days</strong> this year overall.</p>
	</div>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: radial-gradient(80% 50% at 50% 20%, #0d4a37, #062e23 70%);
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(6.6 * var(--u));
		color: #c6f432;
	}

	.head {
		display: flex;
		align-items: flex-end;
		gap: calc(3 * var(--u));
		margin-top: 2cqh;
	}

	.flame {
		width: calc(22 * var(--u));
		flex-shrink: 0;
		overflow: visible;
		filter: drop-shadow(0 0 calc(4 * var(--u)) rgba(255, 106, 19, 0.6));
	}

	.big {
		display: flex;
		align-items: flex-end;
		gap: calc(2.4 * var(--u));
	}

	.num {
		font-size: calc(36 * var(--u));
		line-height: 0.78;
		color: #ff6a13;
	}

	.lbl {
		font-size: calc(7.4 * var(--u));
		line-height: 0.95;
		padding-bottom: calc(1 * var(--u));
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(var(--per), 1fr);
		gap: calc(0.8 * var(--u));
		margin-top: calc(5 * var(--u));
	}

	.cell {
		aspect-ratio: 1;
		border-radius: calc(0.8 * var(--u));
	}

	.legend {
		margin: calc(2.4 * var(--u)) 0 0;
		font-size: calc(3.2 * var(--u));
		opacity: 0.7;
	}

	.facts {
		margin-top: auto;
	}

	.facts p {
		margin: 0;
		font-size: calc(4.2 * var(--u));
		line-height: 1.35;
	}

	.facts .range {
		font-size: calc(9 * var(--u));
		color: #c6f432;
		margin-bottom: calc(1.6 * var(--u));
	}

	strong {
		color: #ffe14d;
	}
</style>
