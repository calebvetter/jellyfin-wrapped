<script lang="ts">
	import { onMount } from 'svelte';
	import type { OriginalSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp } from '../anim';
	const pop = (p: number) => (p < 10 ? p.toFixed(1) : Math.round(p).toLocaleString('en-US'));
	import Poster from '../Poster.svelte';

	let { slide }: { slide: OriginalSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let pctEl: HTMLSpanElement;

	// TMDb popularity is roughly logarithmic: map 0.5 … 500 onto the meter
	const pos = (p: number) => Math.max(2, Math.min(98, ((Math.log10(Math.max(0.5, p)) + 0.3) / 3) * 100));
	const share = $derived(Math.round(slide.morePopularShare * 100));

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker'), { y: 30, opacity: 0, duration: 0.6 }, 0.1)
				.from(q('.headline .mask > *'), { yPercent: 110, duration: 0.8, stagger: 0.1, ease: 'expo.out' }, 0.25)
				.from(q('.pwrap'), { y: 200, rotate: 25, opacity: 0, duration: 1, ease: 'back.out(1.3)' }, 0.6)
				.from(q('.stamp'), { scale: 4, rotate: -60, opacity: 0, duration: 0.35, ease: 'power4.in' }, 1.6)
				.add(() => s.sfx('stamp'), 1.92)
				.to(q('.pwrap'), { x: -6, duration: 0.05, yoyo: true, repeat: 5 }, 1.95)
				.from(q('.ttl'), { y: 20, opacity: 0, duration: 0.5 }, 2.1)
				.from(q('.meter'), { scaleX: 0, transformOrigin: '0 50%', duration: 0.8, ease: 'expo.out' }, 2.5)
				.from(q('.needle.main'), { left: '98%', duration: 1.4, ease: 'elastic.out(1, 0.6)' }, 2.9)
				.from(q('.needle.you'), { left: '98%', duration: 1.8, ease: 'elastic.out(1, 0.5)' }, 3.1)
				.add(() => s.sfx('pop'), 3.3)
				.from(q('.copy'), { y: 20, opacity: 0, duration: 0.5 }, 3.8);
			countUp(tl, pctEl, share, { at: 3.8, duration: 1.2, format: (n) => `${Math.round(n)}%` });
		});
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">Your most obscure pick</p>
	<h2 class="headline display">
		<span class="mask"><span>You're an</span></span>
		<span class="mask"><span class="o">original.</span></span>
	</h2>

	<div class="pwrap">
		<Poster src={slide.title.poster} title={slide.title.title} year={slide.title.year} eager />
		<svg class="stamp" viewBox="0 0 120 120" aria-hidden="true">
			<defs><path id="gem-ring" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" /></defs>
			<circle cx="60" cy="60" r="56" fill="none" stroke="#ff2d3d" stroke-width="5" />
			<circle cx="60" cy="60" r="34" fill="none" stroke="#ff2d3d" stroke-width="2.5" />
			<text font-size="11.5" font-weight="900" letter-spacing="2.4" fill="#ff2d3d" font-family="var(--font-display)"><textPath href="#gem-ring">HIDDEN GEM • CERTIFIED •</textPath></text>
			<path d="M46 52h28l8 10-22 22-22-22z" fill="#ff2d3d" />
		</svg>
	</div>
	<p class="ttl"><strong>{slide.title.title}</strong>{slide.title.year ? ` (${slide.title.year})` : ''}</p>

	<div class="meter-block">
		<div class="meter" aria-hidden="true">
			<span class="needle you" style:left="{pos(slide.title.popularity)}%"><b>{slide.title.title.length > 16 ? 'Your pick' : slide.title.title}</b></span>
			{#if slide.mainstream}
				<span class="needle main" style:left="{pos(slide.mainstream.popularity)}%"><b>{slide.mainstream.title}</b></span>
			{/if}
		</div>
		<div class="scale"><span>Niche</span><span>Mainstream</span></div>
	</div>

	<p class="copy">
		More obscure than <span class="pct display" bind:this={pctEl}>{share}%</span> of everything watched on this server.
		{#if slide.mainstream}<span class="small">TMDb popularity {pop(slide.title.popularity)} vs. {pop(slide.mainstream.popularity)} for {slide.mainstream.title}.</span>{/if}
	</p>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: #ffe14d;
		color: #14080a;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(6 * var(--u));
	}

	.headline {
		margin: calc(1 * var(--u)) 0 0;
		font-size: calc(14 * var(--u));
	}

	.mask {
		display: block;
		overflow: hidden;
	}

	.mask > span {
		display: block;
	}

	.o {
		color: #ff2d3d;
	}

	.pwrap {
		position: relative;
		width: calc(44 * var(--u));
		margin: calc(4 * var(--u)) auto 0;
		transform: rotate(-3deg);
	}

	.pwrap :global(.poster) {
		width: 100%;
		border-radius: calc(2 * var(--u));
		box-shadow: calc(1.6 * var(--u)) calc(1.6 * var(--u)) 0 #14080a;
	}

	.stamp {
		position: absolute;
		right: calc(-14 * var(--u));
		top: calc(-6 * var(--u));
		width: calc(30 * var(--u));
		height: calc(30 * var(--u));
		transform: rotate(14deg);
		filter: drop-shadow(0 calc(0.6 * var(--u)) 0 #ffe14d);
	}

	.ttl {
		margin: calc(4 * var(--u)) 0 0;
		text-align: center;
		font-size: calc(4.6 * var(--u));
	}

	.meter-block {
		margin-top: auto;
	}

	.meter {
		position: relative;
		height: calc(4 * var(--u));
		border-radius: 99px;
		background: linear-gradient(90deg, #ff2d3d, #ff6a13 40%, #14080a);
		margin-top: calc(10 * var(--u));
	}

	.needle {
		position: absolute;
		top: calc(-1.8 * var(--u));
		width: calc(1.2 * var(--u));
		height: calc(7.6 * var(--u));
		margin-left: calc(-0.6 * var(--u));
		border-radius: 99px;
		background: #14080a;
		border: calc(0.5 * var(--u)) solid #ffe14d;
	}

	.needle b {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: calc(1 * var(--u));
		padding: calc(0.8 * var(--u)) calc(2 * var(--u));
		border-radius: 99px;
		background: #14080a;
		color: #ffe14d;
		font-size: calc(2.8 * var(--u));
		white-space: nowrap;
	}

	.needle.main b {
		background: #fff6e6;
		color: #14080a;
		top: 100%;
		bottom: auto;
		margin: calc(1 * var(--u)) 0 0;
	}

	.needle.you b {
		left: 0;
		transform: none;
	}

	.needle.main b {
		left: auto;
		right: 0;
		transform: none;
	}

	.scale {
		display: flex;
		justify-content: space-between;
		margin-top: calc(8 * var(--u));
		font-size: calc(3 * var(--u));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.copy {
		margin: calc(3 * var(--u)) 0 0;
		font-size: calc(4.6 * var(--u));
		line-height: 1.3;
	}

	.pct {
		font-size: 1.6em;
		color: #ff2d3d;
	}

	.small {
		display: block;
		margin-top: calc(1.4 * var(--u));
		font-size: calc(3.2 * var(--u));
		opacity: 0.65;
	}
</style>
