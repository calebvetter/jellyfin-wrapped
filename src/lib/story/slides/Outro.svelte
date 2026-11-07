<script lang="ts">
	import { onMount } from 'svelte';
	import { story } from '../context';
	import { confetti } from '../anim';

	let { onRewatch }: { onRewatch: () => void } = $props();
	const s = story();
	let root: HTMLDivElement;
	let btn: HTMLButtonElement;

	onMount(() => {
		s.timeline(root, (tl, q) => {
			tl.from(q('.l'), { yPercent: 115, duration: 0.9, stagger: 0.1, ease: 'expo.out' }, 0.1)
				.from(q('.thanks'), { y: 20, opacity: 0, duration: 0.6 }, 0.7)
				.from(q('.rewatch'), { scale: 0, rotate: -180, duration: 1, ease: 'elastic.out(1, 0.55)' }, 0.9)
				.add(() => s.sfx('reveal'), 0.3);
			confetti(tl, root, 0.4, { x: 50, y: 30, count: 60, spread: 1.4 });
		});
		s.timeline(root, (tl, q) => {
			tl.to(q('.spin'), { rotate: 360, duration: 10, ease: 'none', repeat: -1 }, 0);
			tl.to(q('.blob'), { scale: 1.15, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: 0.8 }, 0);
		});
		btn.focus({ preventScroll: true });
	});
</script>

<div class="slide" bind:this={root}>
	<span class="blob b1" aria-hidden="true"></span>
	<span class="blob b2" aria-hidden="true"></span>

	<h2 class="display">
		<span class="mask"><span class="l">That's</span></span>
		<span class="mask"><span class="l">a wrap,</span></span>
		<span class="mask"><span class="l name">{s.report.userName}.</span></span>
	</h2>
	<p class="thanks serif">Thanks for spending {s.report.year} with us. Same couch next year?</p>

	<button class="rewatch" bind:this={btn} onclick={onRewatch}>
		<svg class="spin" viewBox="0 0 200 200" aria-hidden="true">
			<defs><path id="rw-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
			<text font-size="15" font-weight="800" letter-spacing="5" fill="#0b0614" font-family="var(--font-display)"><textPath href="#rw-ring">PLAY IT AGAIN • PLAY IT AGAIN • PLAY IT AGAIN •</textPath></text>
		</svg>
		<span class="inner">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></svg>
			Rewatch
		</span>
	</button>
</div>

<style>
	.slide {
		position: absolute;
		inset: 0;
		padding: 14cqh calc(7 * var(--u)) 7cqh;
		background: #0b0614;
		color: #fff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.blob {
		position: absolute;
		border-radius: 50%;
		filter: blur(10px);
		pointer-events: none;
	}

	.b1 {
		width: calc(80 * var(--u));
		height: calc(80 * var(--u));
		right: calc(-30 * var(--u));
		top: 20cqh;
		background: radial-gradient(circle, #ff3ea5, transparent 65%);
		opacity: 0.6;
	}

	.b2 {
		width: calc(90 * var(--u));
		height: calc(90 * var(--u));
		left: calc(-40 * var(--u));
		bottom: calc(-20 * var(--u));
		background: radial-gradient(circle, #6a1cf6, transparent 65%);
		opacity: 0.7;
	}

	h2 {
		position: relative;
		margin: 0;
		font-size: calc(19 * var(--u));
	}

	.mask {
		display: block;
		overflow: hidden;
		padding-bottom: 0.03em;
	}

	.l {
		display: block;
	}

	.name {
		color: #c6f432;
		overflow-wrap: anywhere;
	}

	.thanks {
		position: relative;
		margin: calc(4 * var(--u)) 0 0;
		font-size: calc(6 * var(--u));
		line-height: 1.15;
		max-width: 90%;
	}

	.rewatch {
		position: relative;
		align-self: center;
		margin-top: auto;
		margin-bottom: auto;
		width: calc(52 * var(--u));
		height: calc(52 * var(--u));
		border: 0;
		border-radius: 50%;
		background: #c6f432;
		color: #0b0614;
		cursor: pointer;
		display: grid;
		place-items: center;
		box-shadow: 0 0 0 calc(2 * var(--u)) rgba(198, 244, 50, 0.2), 0 calc(3 * var(--u)) calc(10 * var(--u)) rgba(198, 244, 50, 0.35);
		transition: box-shadow 0.2s;
	}

	.rewatch:hover {
		box-shadow: 0 0 0 calc(3.4 * var(--u)) rgba(198, 244, 50, 0.3), 0 calc(3 * var(--u)) calc(12 * var(--u)) rgba(198, 244, 50, 0.5);
	}

	.spin {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(1 * var(--u));
		font-family: var(--font-display);
		font-weight: 800;
		font-size: calc(6.5 * var(--u));
		text-transform: uppercase;
	}

	.inner svg {
		width: calc(11 * var(--u));
		height: calc(11 * var(--u));
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

</style>
