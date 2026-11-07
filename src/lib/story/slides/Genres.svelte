<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import type { GenresSlide } from '$shared/report';
	import { story } from '../context';
	import { countUp } from '../anim';
	import { pct } from '../format';

	let { slide }: { slide: GenresSlide } = $props();
	const s = story();
	let root: HTMLDivElement;
	let shareEl: HTMLSpanElement;
	let helix: SVGSVGElement;

	const COLORS = ['#c6f432', '#ff3ea5', '#2de2e6', '#ffe14d', '#ff6a13', '#9b6bff', '#c9b6ff', '#6b6476'];
	const RUNGS = 30;
	const colorOf = (i: number) => (slide.genres[i]?.name === 'Everything else' ? '#6b6476' : COLORS[i % COLORS.length]);

	// allocate rungs proportionally to genre share (each genre gets at least one)
	const rungColors = $derived.by(() => {
		const out: string[] = [];
		const g = slide.genres;
		let acc = 0;
		for (let r = 0; r < RUNGS; r++) {
			const pos = (r + 0.5) / RUNGS;
			let i = 0;
			acc = 0;
			for (; i < g.length; i++) {
				acc += g[i].share;
				if (pos <= acc) break;
			}
			out.push(colorOf(Math.min(i, g.length - 1)));
		}
		return out;
	});

	const nameSize = $derived(slide.dominant.name.length > 12 ? 11 : slide.dominant.name.length > 8 ? 14 : 18);

	onMount(() => {
		const rungs = Array.from(helix.querySelectorAll<SVGGElement>('.rung'));
		const draw = (phase: number) => {
			rungs.forEach((g, i) => {
				const a = phase + i * 0.42;
				const x = Math.sin(a) * 34;
				const depth = (Math.cos(a) + 1) / 2; // 0 back .. 1 front
				const [line, d1, d2] = g.children as unknown as SVGElement[];
				line.setAttribute('x1', String(50 - x));
				line.setAttribute('x2', String(50 + x));
				d1.setAttribute('cx', String(50 - x));
				d2.setAttribute('cx', String(50 + x));
				d1.setAttribute('r', String(2.6 + depth * 2.2));
				d2.setAttribute('r', String(2.6 + (1 - depth) * 2.2));
				line.setAttribute('opacity', String(0.35 + depth * 0.5));
			});
		};
		const proxy = { phase: 0 };
		draw(0);
		s.timeline(root, (tl, q) => {
			tl.from(q('.kicker, h2'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.1 }, 0.1)
				.from(q('.rung'), { scale: 0, transformOrigin: '50% 50%', opacity: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' }, 0.3)
				.add(() => s.sfx('sparkle'), 0.4)
				.from(q('.dom-label'), { y: 20, opacity: 0, duration: 0.5 }, 1.6)
				.from(q('.dom-name'), { yPercent: 100, opacity: 0, duration: 0.8, ease: 'expo.out' }, 1.75)
				.add(() => s.sfx('reveal'), 1.8);
			countUp(tl, shareEl, Math.round(slide.dominant.share * 100), { at: 1.9, duration: 1.2, format: (n) => `${Math.round(n)}%` });
			tl.from(q('.legend li'), { x: -30, opacity: 0, duration: 0.45, stagger: 0.09 }, 2.6).from(
				q('.legend .bar i'),
				{ scaleX: 0, transformOrigin: '0 50%', duration: 0.7, stagger: 0.09, ease: 'power3.out' },
				2.7
			);
		});
		s.timeline(root, (tl) => {
			tl.to(proxy, { phase: Math.PI * 2, duration: 7, ease: 'none', repeat: -1, onUpdate: () => draw(proxy.phase) }, 0);
		});
		return () => gsap.killTweensOf(proxy);
	});
</script>

<div class="slide" bind:this={root}>
	<p class="kicker serif">Sequenced from your watch history</p>
	<h2 class="display">Your genre DNA</h2>

	<div class="body">
		<svg class="helix" bind:this={helix} viewBox="0 0 100 {RUNGS * 9 + 6}" aria-hidden="true">
			{#each rungColors as color, i}
				<g class="rung" style:color={color}>
					<line y1={i * 9 + 6} y2={i * 9 + 6} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					<circle cy={i * 9 + 6} fill="currentColor" />
					<circle cy={i * 9 + 6} fill="currentColor" />
				</g>
			{/each}
		</svg>

		<div class="side">
			<p class="dom-label">Dominant gene</p>
			<div class="dom-mask">
				<p class="dom-name display" style:font-size="calc({nameSize} * var(--u))" style:color={colorOf(0)}>{slide.dominant.name}</p>
			</div>
			<p class="dom-share"><span bind:this={shareEl}>{pct(slide.dominant.share)}</span> of your viewing</p>
			{#if slide.dominant.title}
				<p class="dom-title">Mostly thanks to <strong>{slide.dominant.title.title}</strong></p>
			{/if}
		</div>
	</div>

	<ul class="legend">
		{#each slide.genres as g, i (g.name)}
			<li>
				<span class="name">{g.name}</span>
				<span class="bar"><i style:background={colorOf(i)} style:width="{Math.max(3, (g.share / slide.genres[0].share) * 100)}%"></i></span>
				<span class="val">{pct(g.share)}</span>
			</li>
		{/each}
	</ul>
	<p class="foot">{slide.totalGenres} genres in total. Very well-rounded. Probably.</p>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 13cqh calc(6 * var(--u)) 5cqh;
		background: radial-gradient(80% 50% at 20% 40%, #1c0f3a, #0b0614 70%);
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.kicker {
		margin: 0;
		font-size: calc(5.6 * var(--u));
		color: #2de2e6;
	}

	h2 {
		margin: calc(1 * var(--u)) 0 0;
		font-size: calc(13 * var(--u));
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		gap: calc(3 * var(--u));
	}

	.helix {
		height: 100%;
		max-height: calc(92 * var(--u));
		width: calc(34 * var(--u));
		flex-shrink: 0;
		overflow: visible;
		filter: drop-shadow(0 0 calc(2 * var(--u)) rgba(45, 226, 230, 0.25));
	}

	.side {
		min-width: 0;
	}

	.dom-label {
		margin: 0;
		font-size: calc(3.4 * var(--u));
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.dom-mask {
		overflow: hidden;
	}

	.dom-name {
		margin: calc(1 * var(--u)) 0;
		overflow-wrap: anywhere;
	}

	.dom-share {
		margin: 0;
		font-size: calc(4.6 * var(--u));
	}

	.dom-share span {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.6em;
	}

	.dom-title {
		margin: calc(2 * var(--u)) 0 0;
		font-size: calc(3.6 * var(--u));
		opacity: 0.75;
	}

	.legend {
		list-style: none;
		padding: 0;
		margin: 2cqh 0 0;
		display: grid;
		gap: calc(1.4 * var(--u));
	}

	.legend li {
		display: grid;
		grid-template-columns: calc(30 * var(--u)) 1fr calc(10 * var(--u));
		align-items: center;
		gap: calc(2 * var(--u));
		font-size: calc(3.4 * var(--u));
	}

	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar {
		height: calc(2.2 * var(--u));
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}

	.bar i {
		display: block;
		height: 100%;
		border-radius: 99px;
	}

	.val {
		text-align: right;
		font-weight: 700;
	}

	.foot {
		margin: calc(2.4 * var(--u)) 0 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: calc(4.4 * var(--u));
		opacity: 0.7;
	}
</style>
