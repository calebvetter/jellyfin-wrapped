<script lang="ts">
	import { onMount } from 'svelte';
	import type { TopMoviesSlide } from '$shared/report';
	import { story } from '../context';
	import { confetti } from '../anim';
	import { hoursMinutes } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: TopMoviesSlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const top = $derived(slide.items[0]);
	const rest = $derived(slide.items.slice(1));
	const bulbs = Array.from({ length: 22 });

	const watched = (plays: number) => (plays > 1 ? `Watched ${plays}×` : 'Watched once');

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.marquee'), { y: -60, opacity: 0, duration: 0.8, ease: 'back.out(1.6)' }, 0.1)
				.from(q('.bulb'), { opacity: 0.15, duration: 0.05, stagger: { each: 0.03, from: 'random' } }, 0.4)
				.from(q('.screen'), { scaleY: 0.1, opacity: 0, duration: 0.7, ease: 'expo.out' }, 0.5);
			const tickets = q('.ticket').reverse();
			tickets.forEach((t, i) => {
				const at = 1.2 + i * 0.95;
				tl.from(t, { y: 120, rotate: i % 2 ? 14 : -14, opacity: 0, duration: 0.7, ease: 'back.out(1.5)' }, at).add(() => s.sfx('tick', { pitch: 0.7 + i * 0.1 }), at);
			});
			const reveal = 1.2 + tickets.length * 0.95 + 0.6;
			// #1's music fades in as the #2 ticket lands (the last one before the curtain), fully in by the reveal
			tl.add(() => s.musicCue(), tickets.length ? 1.2 + (tickets.length - 1) * 0.95 : Math.max(0, reveal - 1.7));
			tl.add(() => s.sfx('drumroll'), reveal - 1.1)
				.to(q('.curtain.l'), { xPercent: -100, duration: 1.3, ease: 'power3.inOut' }, reveal)
				.to(q('.curtain.r'), { xPercent: 100, duration: 1.3, ease: 'power3.inOut' }, reveal)
				.add(() => s.sfx('reveal'), reveal + 0.3)
				.from(q('.feature'), { scale: 0.75, opacity: 0, duration: 1.1, ease: 'expo.out' }, reveal + 0.3)
				.from(q('.caption > *'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.1 }, reveal + 0.9)
				.from(q('.badge'), { scale: 0, rotate: -40, duration: 0.7, ease: 'elastic.out(1, 0.5)' }, reveal + 1.3);
			confetti(tl, root, reveal + 0.5, { x: 50, y: 30, count: 30, colors: ['#ff2d3d', '#ffe14d', '#14080a', '#ffffff'] });
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.bulb'), { opacity: 0.35, duration: 0.4, stagger: { each: 0.08, repeat: -1, yoyo: true } }, 2);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<div class="marquee">
		<div class="bulbs" aria-hidden="true">
			{#each bulbs as _}<i class="bulb"></i>{/each}
		</div>
		<p class="now">Now showing</p>
		<h2 class="display">Your top movies</h2>
	</div>

	<div class="screen">
		<div class="feature">
			{#if top.backdrop}
				<img class="backdrop" src={top.backdrop} alt="" />
			{/if}
			<Poster src={top.poster} title={top.title} year={top.year} class="feature-poster" eager />
		</div>
		<div class="curtain l" aria-hidden="true"></div>
		<div class="curtain r" aria-hidden="true"></div>
	</div>

	<div class="caption">
		<span class="label">#1 · {watched(top.plays)} · {hoursMinutes(top.minutes)}</span>
		<h3 class="display">{top.title}</h3>
		{#if top.plays > 1}<span class="badge">Rewatched!</span>{/if}
	</div>

	<ol class="tickets" start="2">
		{#each rest as item (item.key)}
			<li class="ticket">
				<span class="stub display">{item.rank}</span>
				<Poster src={item.poster} title={item.title} class="tposter" />
				<span class="tinfo">
					<span class="admit">Admit one</span>
					<span class="tt">{item.title}</span>
					<span class="tm">{watched(item.plays)}</span>
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 12cqh calc(6 * var(--u)) 5cqh;
		background: #fff1dc;
		color: #14080a;
		display: flex;
		flex-direction: column;
		gap: calc(3 * var(--u));
		overflow: hidden;
	}

	.marquee {
		position: relative;
		text-align: center;
		padding: calc(3.4 * var(--u)) calc(4 * var(--u)) calc(3 * var(--u));
		border-radius: calc(3 * var(--u));
		background: #ff2d3d;
		color: #fff1dc;
		box-shadow: 0 calc(1.4 * var(--u)) 0 #14080a;
	}

	.bulbs {
		position: absolute;
		inset: calc(1.2 * var(--u));
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		pointer-events: none;
	}

	.bulb {
		width: calc(1.6 * var(--u));
		height: calc(1.6 * var(--u));
		border-radius: 50%;
		background: #ffe14d;
		box-shadow: 0 0 calc(2 * var(--u)) #ffe14d;
	}

	.now {
		margin: calc(1.4 * var(--u)) 0 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(5.6 * var(--u));
	}

	h2 {
		margin: 0;
		font-size: calc(11.5 * var(--u));
	}

	.screen {
		position: relative;
		flex: 1;
		min-height: 0;
		border-radius: calc(3 * var(--u));
		background: #14080a;
		overflow: hidden;
		display: grid;
		place-items: center;
		box-shadow: inset 0 0 calc(6 * var(--u)) rgba(0, 0, 0, 0.8);
	}

	.feature {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.45;
		filter: blur(1px) saturate(1.2);
	}

	.feature :global(.feature-poster) {
		position: relative;
		height: 86%;
		width: auto;
		border-radius: calc(1.6 * var(--u));
		box-shadow: 0 calc(3 * var(--u)) calc(8 * var(--u)) rgba(0, 0, 0, 0.7);
	}

	.curtain {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50.5%;
		background: repeating-linear-gradient(90deg, #a3121f 0 calc(3 * var(--u)), #ff2d3d calc(3 * var(--u)) calc(4.5 * var(--u)), #a3121f calc(4.5 * var(--u)) calc(7 * var(--u)));
		box-shadow: inset 0 calc(-4 * var(--u)) calc(6 * var(--u)) rgba(0, 0, 0, 0.4);
	}

	.curtain.l {
		left: 0;
	}

	.curtain.r {
		right: 0;
	}

	.caption {
		position: relative;
		text-align: center;
	}

	.label {
		display: inline-block;
		font-size: calc(3.6 * var(--u));
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #ff2d3d;
	}

	h3 {
		margin: calc(1 * var(--u)) 0 0;
		font-size: calc(10 * var(--u));
		line-height: 0.92;
	}

	.badge {
		position: absolute;
		right: calc(-2 * var(--u));
		top: calc(-9 * var(--u));
		padding: calc(2 * var(--u)) calc(3 * var(--u));
		border-radius: 99px;
		background: #ffe14d;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(4 * var(--u));
		transform: rotate(10deg);
		box-shadow: 0 calc(1 * var(--u)) 0 #14080a;
	}

	.tickets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: calc(2.4 * var(--u));
	}

	.ticket {
		position: relative;
		display: flex;
		align-items: center;
		gap: calc(2 * var(--u));
		padding: calc(1.8 * var(--u)) calc(2.4 * var(--u)) calc(1.8 * var(--u)) 0;
		border-radius: calc(1.6 * var(--u));
		background: #fff;
		border: calc(0.5 * var(--u)) dashed #14080a33;
		/* punched notches */
		mask: radial-gradient(circle at 0 50%, transparent calc(2 * var(--u)), #000 calc(2.1 * var(--u))) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% 50%, transparent calc(2 * var(--u)), #000 calc(2.1 * var(--u))) right / 51% 100% no-repeat;
		box-shadow: 0 calc(1 * var(--u)) calc(2 * var(--u)) rgba(20, 8, 10, 0.12);
	}

	.stub {
		width: calc(9 * var(--u));
		text-align: center;
		font-size: calc(8 * var(--u));
		color: #ff2d3d;
		border-right: calc(0.5 * var(--u)) dashed #14080a44;
		padding-left: calc(1.5 * var(--u));
	}

	.ticket :global(.tposter) {
		width: calc(8 * var(--u));
		border-radius: calc(0.8 * var(--u));
	}

	.tinfo {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.admit {
		font-size: calc(2.4 * var(--u));
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #ff2d3d;
	}

	.tt {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(3.6 * var(--u));
		line-height: 1.05;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.tm {
		font-size: calc(2.8 * var(--u));
		opacity: 0.65;
	}
</style>
