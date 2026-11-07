<script lang="ts">
	import { seeded } from './format';

	interface Props {
		src: string | null;
		title: string;
		year?: number | null;
		class?: string;
		style?: string;
		eager?: boolean;
	}
	let { src, title, year = null, class: cls = '', style = '', eager = false }: Props = $props();

	const PALETTES = [
		['#ff3ea5', '#2a0a73'],
		['#c6f432', '#0e5c4a'],
		['#ff6a13', '#3b0a1e'],
		['#2de2e6', '#08123d'],
		['#ffe14d', '#6a1cf6'],
		['#c9b6ff', '#2448ff']
	];
	let failed = $state(false);
	const rnd = $derived(seeded(title));
	const pal = $derived(PALETTES[Math.floor(rnd() * PALETTES.length)]);
</script>

<div class="poster {cls}" {style}>
	{#if src && !failed}
		<img {src} alt="Poster for {title}" loading={eager ? 'eager' : 'lazy'} decoding="async" onerror={() => (failed = true)} draggable="false" />
	{:else}
		<div class="fallback" style:--a={pal[0]} style:--b={pal[1]} role="img" aria-label="Poster for {title}">
			<span class="t">{title}</span>
			{#if year}<span class="y">{year}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.poster {
		position: relative;
		aspect-ratio: 2 / 3;
		overflow: hidden;
		border-radius: 1.6cqw;
		background: #1a1029;
		flex-shrink: 0;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}

	.fallback {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 8%;
		background:
			radial-gradient(circle at 80% 15%, var(--a) 0 22%, transparent 23%),
			linear-gradient(160deg, var(--b), #0b0614);
		color: #fff;
		container-type: inline-size;
	}

	.t {
		font-family: var(--font-display);
		font-weight: 800;
		font-stretch: 75%;
		text-transform: uppercase;
		line-height: 0.9;
		font-size: 15cqw;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.y {
		margin-top: 4%;
		font-size: 9cqw;
		opacity: 0.7;
	}
</style>
