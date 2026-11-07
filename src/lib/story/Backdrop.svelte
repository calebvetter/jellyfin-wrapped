<script lang="ts">
	interface Props {
		posters: string[];
		year: number;
		glow: string;
	}
	let { posters, year, glow }: Props = $props();

	const COLS = 6;
	const columns = $derived.by(() => {
		const list = posters.length ? posters : [];
		const cols: string[][] = [];
		for (let c = 0; c < COLS; c++) {
			const col: string[] = [];
			for (let i = 0; i < 10; i++) if (list.length) col.push(list[(c * 3 + i * 5) % list.length]); // each half ≈ 3000px: taller than the wall on 4K screens
			cols.push(col);
		}
		return cols;
	});
</script>

<div class="backdrop" aria-hidden="true" style:--glow={glow}>
	{#if posters.length}
		<div class="wall">
			{#each columns as col, c}
				<div class="col" class:down={c % 2 === 1} style:animation-duration="{100 + c * 12}s">
					{#each [...col, ...col] as src}
						<img {src} alt="" decoding="async" />
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<div class="blobs">
			<span></span><span></span><span></span>
		</div>
	{/if}
	<div class="tint"></div>
	<div class="grain"></div>
	<div class="year">{year}</div>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		display: none;
	}

	@media (min-width: 640px) and (min-height: 560px) {
		.backdrop {
			display: block;
		}
	}

	.wall {
		position: absolute;
		inset: -30%;
		display: flex;
		gap: 22px;
		justify-content: center;
		/* columns must be as tall as their content (not stretched), or -50% isn't one loop */
		align-items: flex-start;
		transform: rotate(-14deg) scale(1.05);
		opacity: 0.38;
		filter: saturate(1.15);
	}

	/* The list is duplicated and scrolled by -50%. A trailing gap (padding = gap) makes the
	   two halves exactly equal so the loop is seamless. */
	.col {
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding-bottom: 22px;
		width: 190px;
		animation: drift linear infinite;
		will-change: transform;
	}

	.col.down {
		animation-direction: reverse;
	}

	.col img {
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 14px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
	}

	@keyframes drift {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-50%);
		}
	}

	.tint {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(60% 70% at 50% 50%, color-mix(in srgb, var(--glow) 38%, transparent), transparent 70%),
			radial-gradient(120% 90% at 50% 50%, transparent 30%, rgba(7, 3, 13, 0.92) 75%),
			linear-gradient(180deg, rgba(7, 3, 13, 0.5), rgba(7, 3, 13, 0.75));
		transition: background 0.8s;
	}

	.grain {
		position: absolute;
		inset: 0;
		opacity: 0.12;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
	}

	.year {
		position: absolute;
		left: -0.04em;
		bottom: -0.2em;
		font-family: var(--font-display);
		font-weight: 800;
		font-stretch: 75%;
		font-size: min(38vw, 64vh);
		line-height: 0.8;
		letter-spacing: -0.04em;
		color: transparent;
		-webkit-text-stroke: 2px color-mix(in srgb, var(--glow) 55%, rgba(255, 255, 255, 0.25));
		opacity: 0.35;
		transition: -webkit-text-stroke-color 0.8s;
	}

	.blobs span {
		position: absolute;
		width: 50vmax;
		height: 50vmax;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.45;
		background: var(--glow);
		animation: float 24s ease-in-out infinite alternate;
	}

	.blobs span:nth-child(1) {
		left: -10vmax;
		top: -10vmax;
	}
	.blobs span:nth-child(2) {
		right: -15vmax;
		bottom: -15vmax;
		background: #ff3ea5;
		animation-delay: -8s;
	}
	.blobs span:nth-child(3) {
		left: 30vw;
		top: 40vh;
		background: #c6f432;
		opacity: 0.2;
		animation-delay: -16s;
	}

	@keyframes float {
		to {
			transform: translate(10vmax, 6vmax) scale(1.2);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.col,
		.blobs span {
			animation: none;
		}
	}
</style>
