<script lang="ts">
	import { onMount } from 'svelte';
	import type { SummarySlide } from '$shared/report';
	import { story } from '../context';
	import { fmt } from '../format';
	import Poster from '../Poster.svelte';
	import Emblem from '../Emblem.svelte';

	let { slide }: { slide: SummarySlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const hours = $derived(Math.round(slide.minutes / 60));
	const posters = $derived([slide.topShow ? { label: 'Top show', t: slide.topShow } : null, slide.topMovie ? { label: 'Top movie', t: slide.topMovie } : null].filter((x) => x !== null));

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.who'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.title .mask > *'), { yPercent: 110, duration: 0.8, stagger: 0.1, ease: 'expo.out' }, 0.2)
				.from(q('.pcard'), { y: 120, rotate: (i: number) => (i ? 18 : -18), opacity: 0, duration: 0.9, stagger: 0.15, ease: 'back.out(1.4)' }, 0.6)
				.add(() => s.sfx('pop'), 0.7)
				.from(q('.tile'), { scale: 0.4, opacity: 0, duration: 0.6, stagger: 0.12, ease: 'back.out(1.8)' }, 1.2)
				.add(() => s.sfx('sparkle'), 1.3)
				.from(q('.sign'), { opacity: 0, duration: 0.8 }, 2.4);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="who serif">{s.report.userName}'s year in review</p>
	<h2 class="title display">
		<span class="mask"><span>{s.report.year}</span></span>
		<span class="mask"><span class="w">Wrapped</span></span>
	</h2>

	{#if posters.length}
		<div class="posters" class:single={posters.length === 1}>
			{#each posters as p, i (p.label)}
				<figure class="pcard" style:--r="{i ? 4 : -4}deg">
					<Poster src={p.t.poster} title={p.t.title} year={p.t.year} eager />
					<figcaption><span>{p.label}</span>{p.t.title}</figcaption>
				</figure>
			{/each}
		</div>
	{/if}

	<div class="tiles">
		<div class="tile lime"><span>Watch time</span><b class="display">{fmt(hours)} hrs</b></div>
		{#if slide.genre}<div class="tile pink"><span>Top genre</span><b class="display">{slide.genre}</b></div>{/if}
		{#if slide.streakDays}<div class="tile cyan"><span>Longest streak</span><b class="display">{slide.streakDays} days</b></div>{/if}
		{#if slide.clockPersona}<div class="tile orange"><span>Prime viewing</span><b class="display">{slide.clockPersona.replace(/^The /, '')}</b></div>{/if}
		{#if slide.personality}
			<div class="tile yellow wide">
				<div class="em"><Emblem id={slide.personality.id} /></div>
				<div><span>Watching personality</span><b class="display">{slide.personality.name}</b></div>
			</div>
		{/if}
	</div>
	<p class="sign">Jellyfin Wrapped · {s.report.rangeStart.slice(0, 4)}</p>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 12cqh calc(6 * var(--u)) 4cqh;
		background:
			radial-gradient(60% 40% at 100% 0%, #3b1499, transparent 70%),
			radial-gradient(60% 40% at 0% 100%, #5b0f3f, transparent 70%),
			#0b0614;
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.who {
		margin: 0;
		font-size: calc(5.8 * var(--u));
		color: #c6f432;
	}

	.title {
		margin: 0;
		display: flex;
		gap: calc(3 * var(--u));
		align-items: baseline;
		font-size: calc(15 * var(--u));
	}

	.mask {
		display: block;
		overflow: hidden;
	}

	.mask > span {
		display: block;
	}

	/* Variable-font glyphs have overlapping contours; stroking them shows the overlaps.
	   Paint the stroke first and cover its inner half with a background-coloured fill. */
	.w {
		color: #0e0719;
		-webkit-text-stroke: calc(0.9 * var(--u)) #fff;
		paint-order: stroke fill;
		letter-spacing: 0.015em;
	}

	.posters {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-content: center;
		gap: calc(5 * var(--u));
		margin: calc(5 * var(--u)) calc(6 * var(--u)) calc(4 * var(--u));
	}

	.posters.single {
		grid-template-columns: 1fr;
		width: 46%;
		margin-inline: auto;
	}

	.pcard {
		margin: 0;
		transform: rotate(var(--r));
	}

	.pcard :global(.poster) {
		width: 100%;
		border-radius: calc(2 * var(--u));
		box-shadow: 0 0 0 calc(0.8 * var(--u)) #fff;
	}

	figcaption {
		margin-top: calc(2 * var(--u));
		font-family: var(--font-display);
		font-weight: 700;
		font-size: calc(3.8 * var(--u));
		line-height: 1.05;
		text-align: center;
	}

	figcaption span {
		display: block;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: calc(2.8 * var(--u));
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: calc(2.4 * var(--u));
		margin-top: auto;
	}

	.tile {
		padding: calc(3 * var(--u)) calc(3.4 * var(--u));
		border-radius: calc(3.4 * var(--u));
		color: #0b0614;
		min-width: 0;
	}

	.tile span {
		display: block;
		font-size: calc(2.7 * var(--u));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.tile b {
		display: block;
		font-size: calc(7 * var(--u));
		line-height: 0.95;
		margin-top: calc(0.6 * var(--u));
		overflow-wrap: anywhere;
	}

	.wide {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: calc(3 * var(--u));
	}

	.em {
		width: calc(13 * var(--u));
		height: calc(13 * var(--u));
		flex-shrink: 0;
	}

	.em :global(svg) {
		width: 100%;
		height: 100%;
	}

	.lime {
		background: #c6f432;
	}
	.pink {
		background: #ff3ea5;
	}
	.cyan {
		background: #2de2e6;
	}
	.orange {
		background: #ff6a13;
	}
	.yellow {
		background: #ffe14d;
	}

	.sign {
		margin: calc(3 * var(--u)) 0 0;
		text-align: center;
		font-size: calc(2.8 * var(--u));
		letter-spacing: 0.2em;
		text-transform: uppercase;
		opacity: 0.45;
	}
</style>
