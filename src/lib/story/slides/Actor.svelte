<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActorSlide } from '$shared/report';
	import { story } from '../context';
	import { hoursMinutes } from '../format';
	import Poster from '../Poster.svelte';

	let { slide }: { slide: ActorSlide } = $props();
	const s = story();
	let root: HTMLDivElement;

	const parts = $derived(slide.actor.name.split(/\s+/));
	const nameLines = $derived(parts.length > 2 ? [parts.slice(0, -1).join(' '), parts[parts.length - 1]] : parts);
	const longest = $derived(Math.max(...nameLines.map((l) => l.length)));
	const nameSize = $derived(Math.min(22, 120 / Math.max(5, longest)));
	const initials = $derived(parts.map((p) => p[0]).join('').slice(0, 2));
	let portraitFailed = $state(false);

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.arch'), { yPercent: 40, scale: 0.85, opacity: 0, duration: 1, ease: 'expo.out' }, 0.3)
				.from(q('.ring'), { scale: 0.5, opacity: 0, rotate: -90, duration: 1.2, ease: 'expo.out' }, 0.35)
				.from(q('.name-line'), { yPercent: 110, duration: 0.8, stagger: 0.12, ease: 'expo.out' }, 0.9)
				.add(() => s.sfx('reveal'), 0.95)
				.from(q('.count'), { scale: 0, rotate: -20, duration: 0.7, ease: 'back.out(2)' }, 1.7)
				.add(() => s.sfx('pop'), 1.75)
				.from(q('.copy'), { y: 20, opacity: 0, duration: 0.5 }, 2.1)
				.from(q('.fan > *'), { y: 80, rotate: 0, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'back.out(1.6)' }, 2.4)
				.from(q('.runners'), { y: 20, opacity: 0, duration: 0.5 }, 3.4);
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.ring'), { rotate: 360, duration: 20, ease: 'none', repeat: -1 }, 0);
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">Let's be honest. You had a type.</p>

	<div class="stage">
		<svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
			<defs><path id="actor-ring" d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0" /></defs>
			<text font-size="12" font-weight="800" letter-spacing="3.2" fill="#14080a" font-family="var(--font-display)">
				<textPath href="#actor-ring">MOST-WATCHED STAR ★ MOST-WATCHED STAR ★ </textPath>
			</text>
		</svg>
		<div class="arch">
			{#if slide.actor.portrait && !portraitFailed}
				<img src={slide.actor.portrait} alt="Portrait of {slide.actor.name}" onerror={() => (portraitFailed = true)} />
				<div class="duo" aria-hidden="true"></div>
			{:else}
				<div class="initials display" aria-hidden="true">{initials}</div>
			{/if}
		</div>
		<span class="count display" aria-hidden="true">×{slide.titleCount}</span>
	</div>

	<h2 class="name display" style:font-size="calc({nameSize} * var(--u))">
		{#each nameLines as line}<span class="mask"><span class="name-line">{line}</span></span>{/each}
	</h2>

	<p class="copy">
		showed up in <strong>{slide.titleCount} different titles</strong> you watched — {hoursMinutes(slide.minutes)} of quality time together.
	</p>

	<div class="fan">
		{#each slide.titles.slice(0, 5) as t, i (t.key)}
			<div class="fan-item" style:--r="{(i - 2) * 6}deg" style:--y="calc({Math.abs(i - 2) * 1.6} * var(--u))">
				<Poster src={t.poster} title={t.title} year={t.year} />
				{#if t.character}<span class="char">as {t.character}</span>{/if}
			</div>
		{/each}
	</div>

	{#if slide.runnersUp.length}
		<p class="runners">
			Also on your radar:
			{#each slide.runnersUp as r, i}<strong>{r.name}</strong> ({r.titleCount}){i < slide.runnersUp.length - 1 ? ' · ' : ''}{/each}
		</p>
	{/if}
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 12cqh calc(6 * var(--u)) 5cqh;
		background: #ff6a13;
		color: #14080a;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: hidden;
		text-align: center;
	}

	.kicker {
		margin: 0;
		font-size: calc(6.4 * var(--u));
	}

	.stage {
		position: relative;
		width: calc(62 * var(--u));
		height: calc(62 * var(--u));
		margin-top: 3cqh;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.ring {
		position: absolute;
		inset: calc(-6 * var(--u));
		width: calc(100% + calc(12 * var(--u)));
		height: calc(100% + calc(12 * var(--u)));
	}

	.arch {
		position: relative;
		width: calc(44 * var(--u));
		height: calc(50 * var(--u));
		border-radius: calc(22 * var(--u)) calc(22 * var(--u)) calc(3 * var(--u)) calc(3 * var(--u));
		overflow: hidden;
		background: #14080a;
		box-shadow: 0 calc(2 * var(--u)) 0 #14080a;
	}

	.arch img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: grayscale(1) contrast(1.25) brightness(1.05);
	}

	.duo {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, #ff3ea5, #ff6a13);
		mix-blend-mode: multiply;
	}

	.initials {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		font-size: calc(26 * var(--u));
		color: #ff6a13;
	}

	.count {
		position: absolute;
		right: calc(-6 * var(--u));
		bottom: calc(2 * var(--u));
		display: grid;
		place-items: center;
		width: calc(22 * var(--u));
		height: calc(22 * var(--u));
		border-radius: 50%;
		background: #ffe14d;
		font-size: calc(10 * var(--u));
		transform: rotate(12deg);
		box-shadow: 0 calc(1.2 * var(--u)) 0 #14080a;
	}

	.name {
		margin: 3cqh 0 0;
		color: #fff6e6;
		text-shadow: calc(0.8 * var(--u)) calc(0.8 * var(--u)) 0 #14080a;
		line-height: 0.88;
	}

	.mask {
		display: block;
		overflow: hidden;
		padding: 0.04em 0.1em 0.06em;
	}

	.name-line {
		display: block;
	}

	.copy {
		margin: calc(2 * var(--u)) 0 0;
		font-size: calc(4.4 * var(--u));
		line-height: 1.3;
		max-width: 92%;
	}

	.fan {
		display: flex;
		justify-content: center;
		gap: calc(1 * var(--u));
		margin-top: auto;
		padding-top: calc(3 * var(--u));
	}

	.fan-item {
		width: calc(16 * var(--u));
		transform: rotate(var(--r)) translateY(var(--y));
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.fan-item :global(.poster) {
		width: 100%;
		box-shadow: 0 calc(1.4 * var(--u)) 0 #14080a;
	}

	.char {
		margin-top: calc(1.4 * var(--u));
		font-size: calc(2.4 * var(--u));
		font-weight: 700;
		line-height: 1.1;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.runners {
		margin: calc(6 * var(--u)) 0 0;
		font-size: calc(3.4 * var(--u));
	}
</style>
