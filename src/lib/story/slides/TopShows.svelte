<script lang="ts">
	import { onMount } from 'svelte';
	import type { TopShowsSlide } from '$shared/report';
	import { story } from '../context';
	import { confetti, splitChars } from '../anim';
	import { fmt, hoursMinutes } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: TopShowsSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let titleEl: HTMLHeadingElement;

	const top = $derived(slide.items[0]);
	const rest = $derived(slide.items.slice(1));
	const titleSize = $derived(top.title.length > 22 ? 8.5 : top.title.length > 14 ? 10.5 : 13);

	onMount(() => {
		s.timeline(root, (tl, q) => {
			const rows = q('.row').reverse(); // countdown: lowest rank first
			tl.from(q('.head > *'), { y: 40, opacity: 0, duration: 0.7, stagger: 0.1 }, 0.1);
			rows.forEach((row, i) => {
				const at = 0.8 + i * 1.05;
				tl.from(row, { xPercent: i % 2 ? -115 : 115, rotate: i % 2 ? -6 : 6, duration: 0.75, ease: 'back.out(1.4)' }, at).add(() => s.sfx('pop', { pitch: 0.8 + i * 0.12 }), at + 0.1);
				tl.from(row.querySelector('.rank'), { scale: 2.4, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, at + 0.25);
			});
			const tease = 0.8 + rows.length * 1.05 + 0.2;
			tl.fromTo(q('.tease'), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' }, tease)
				.add(() => s.sfx('drumroll'), tease)
				.add(() => s.musicCue(), tease) // #1's music fades in under "And your #1…", fully in by the reveal
				.to(q('.tease'), { scale: 1.06, duration: 0.18, yoyo: true, repeat: 5, ease: 'sine.inOut' }, tease + 0.6)
				.to(q('.tease'), { scale: 3, opacity: 0, duration: 0.45, ease: 'power2.in' }, tease + 1.9);
			const hero = tease + 2.2;
			const chars = splitChars(titleEl);
			tl.from(q('.rays'), { scale: 0, opacity: 0, duration: 1, ease: 'expo.out' }, hero)
				.from(q('.hero-poster'), { scale: 0.2, rotate: -40, y: 200, opacity: 0, duration: 1.1, ease: 'back.out(1.5)' }, hero)
				.add(() => s.sfx('reveal'), hero + 0.1)
				.from(q('.numone'), { scale: 0, rotate: 30, duration: 0.8, ease: 'elastic.out(1, 0.5)' }, hero + 0.45)
				.from(chars, { yPercent: 120, opacity: 0, duration: 0.6, stagger: 0.025, ease: 'back.out(2)' }, hero + 0.5)
				.from(q('.hero-meta'), { y: 20, opacity: 0, duration: 0.5 }, hero + 0.9);
			confetti(tl, root, hero + 0.25, { x: 50, y: 34, count: 46 });
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.rays'), { rotate: 360, duration: 24, ease: 'none', repeat: -1 }, 0);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<div class="head">
		<p class="kicker serif">You couldn't stop watching</p>
		<h2 class="display">Your top shows</h2>
	</div>

	<div class="hero">
		<svg class="rays" viewBox="-100 -100 200 200" aria-hidden="true">
			{#each Array.from({ length: 16 }) as _, i}
				<path d="M0 0 L{Math.cos((i / 16) * Math.PI * 2) * 100} {Math.sin((i / 16) * Math.PI * 2) * 100} L{Math.cos(((i + 0.45) / 16) * Math.PI * 2) * 100} {Math.sin(((i + 0.45) / 16) * Math.PI * 2) * 100}Z" />
			{/each}
		</svg>
		<p class="tease display" aria-hidden="true">And your<br /><span>#1</span> show is…</p>
		<div class="hero-card">
			<div class="hero-poster">
				<Poster src={top.poster} title={top.title} year={top.year} eager />
				<span class="numone display" aria-hidden="true">#1</span>
			</div>
			<div class="hero-text">
				<h3 class="display" bind:this={titleEl} style:font-size="calc({titleSize} * var(--u))">{top.title}</h3>
				<p class="hero-meta">
					<strong>{fmt(top.episodes ?? top.plays)}</strong> episodes · <strong>{hoursMinutes(top.minutes)}</strong>
				</p>
			</div>
		</div>
	</div>

	<ol class="list" start="2">
		{#each rest as item (item.key)}
			<li class="row">
				<span class="rank display">{item.rank}</span>
				<Poster src={item.poster} title={item.title} class="thumb" />
				<span class="info">
					<span class="t">{item.title}</span>
					<span class="m">{fmt(item.episodes ?? item.plays)} episodes · {hoursMinutes(item.minutes)}</span>
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: radial-gradient(90% 60% at 50% 30%, #6a1cf6 0%, #4b12d6 45%, #2a0a73 100%);
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(6.5 * var(--u));
		color: #c6f432;
	}

	h2 {
		margin: calc(0.5 * var(--u)) 0 0;
		font-size: calc(13 * var(--u));
	}

	.hero {
		position: relative;
		flex: 1;
		display: grid;
		place-items: center;
		min-height: 0;
	}

	.rays {
		position: absolute;
		width: calc(300 * var(--u));
		height: calc(300 * var(--u));
		mask-image: radial-gradient(closest-side, #000 25%, transparent 100%);
		fill: rgba(198, 244, 50, 0.13);
		pointer-events: none;
	}

	.tease {
		position: absolute;
		margin: 0;
		text-align: center;
		font-size: calc(11 * var(--u));
		opacity: 0;
		z-index: 3;
	}

	.tease span {
		color: #c6f432;
		font-size: 2em;
	}

	.hero-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: calc(5 * var(--u));
		width: 100%;
	}

	.hero-poster {
		position: relative;
		width: calc(40 * var(--u));
		flex-shrink: 0;
		transform: rotate(-4deg);
	}

	.hero-poster :global(.poster) {
		width: 100%;
		border-radius: calc(2.4 * var(--u));
		box-shadow:
			0 0 0 calc(1.2 * var(--u)) #c6f432,
			0 calc(4 * var(--u)) calc(10 * var(--u)) rgba(0, 0, 0, 0.5);
	}

	.numone {
		position: absolute;
		top: calc(-5 * var(--u));
		left: calc(-5 * var(--u));
		display: grid;
		place-items: center;
		width: calc(17 * var(--u));
		height: calc(17 * var(--u));
		border-radius: 50%;
		background: #ff3ea5;
		color: #fff;
		font-size: calc(8.5 * var(--u));
		box-shadow: 0 calc(1.2 * var(--u)) 0 #2a0a73;
	}

	.hero-text {
		min-width: 0;
	}

	h3 {
		margin: 0;
		line-height: 0.9;
		overflow-wrap: anywhere;
	}

	.hero-meta {
		margin: calc(2.5 * var(--u)) 0 0;
		font-size: calc(4 * var(--u));
		opacity: 0.9;
	}

	.hero-meta strong {
		color: #c6f432;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: calc(2 * var(--u));
	}

	.row {
		display: flex;
		align-items: center;
		gap: calc(3 * var(--u));
		padding: calc(2 * var(--u)) calc(3 * var(--u)) calc(2 * var(--u)) calc(2 * var(--u));
		border-radius: calc(3 * var(--u));
		background: rgba(11, 6, 20, 0.35);
		backdrop-filter: blur(4px);
	}

	.rank {
		width: calc(8 * var(--u));
		text-align: center;
		font-size: calc(9 * var(--u));
		color: #c6f432;
	}

	.row :global(.thumb) {
		width: calc(10 * var(--u));
		border-radius: calc(1.2 * var(--u));
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.t {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(4.6 * var(--u));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.m {
		font-size: calc(3.3 * var(--u));
		opacity: 0.75;
	}
</style>
