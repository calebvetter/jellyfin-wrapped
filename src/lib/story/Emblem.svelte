<script lang="ts">
	/** Original geometric illustrations for clock personas and watching personalities. */
	interface Props {
		id: string;
		class?: string;
	}
	let { id, class: cls = '' }: Props = $props();
</script>

<svg class="emblem {cls}" viewBox="0 0 120 120" aria-hidden="true">
	{#if id === 'early-bird'}
		<circle cx="60" cy="78" r="34" fill="#ffe14d" />
		<rect x="0" y="78" width="120" height="42" fill="currentColor" opacity="0.18" />
		{#each [0, 1, 2, 3, 4] as i}<rect x="58" y="22" width="4" height="12" rx="2" fill="#ffe14d" transform="rotate({-60 + i * 30} 60 78)" />{/each}
		<path d="M30 44q10-10 20 0q10-10 20 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
	{:else if id === 'daytime-drifter'}
		<rect x="26" y="42" width="56" height="58" rx="10" fill="#fff6e6" />
		<path d="M82 54h8a12 12 0 010 24h-8" fill="none" stroke="#fff6e6" stroke-width="8" />
		<rect x="26" y="42" width="56" height="16" rx="6" fill="#ff6a13" />
		<path d="M42 32q-6-10 0-18M56 32q-6-10 0-18M70 32q-6-10 0-18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
	{:else if id === 'afternoon-escapist'}
		<circle cx="60" cy="60" r="28" fill="#ffe14d" />
		{#each Array.from({ length: 10 }) as _, i}<rect x="57" y="10" width="6" height="14" rx="3" fill="#ffe14d" transform="rotate({i * 36} 60 60)" />{/each}
		<path d="M38 56h18v6a8 8 0 01-16 0zM64 56h18v6a8 8 0 01-16 0z" fill="#14080a" />
		<rect x="54" y="57" width="12" height="3" fill="#14080a" />
	{:else if id === 'prime-time'}
		<path d="M18 84l8-48 20 22 14-30 14 30 20-22 8 48z" fill="#ffe14d" />
		<rect x="18" y="86" width="84" height="12" rx="4" fill="#ffe14d" />
		<circle cx="26" cy="34" r="6" fill="#ff3ea5" /><circle cx="60" cy="24" r="6" fill="#2de2e6" /><circle cx="94" cy="34" r="6" fill="#c6f432" />
	{:else if id === 'night-owl'}
		<path d="M24 44q0-28 36-28t36 28v32q0 32-36 32t-36-32z" fill="#9b6bff" />
		<path d="M24 26l14 14M96 26l-14 14" stroke="#9b6bff" stroke-width="10" stroke-linecap="round" />
		<circle cx="44" cy="54" r="16" fill="#fff6e6" /><circle cx="76" cy="54" r="16" fill="#fff6e6" />
		<circle cx="44" cy="56" r="7" fill="#14080a" /><circle cx="76" cy="56" r="7" fill="#14080a" />
		<path d="M54 70l6 10 6-10z" fill="#ffe14d" />
		<path d="M40 92q20 8 40 0" fill="none" stroke="#14080a" stroke-width="3" opacity="0.4" />
	{:else if id === 'midnight-gremlin'}
		<path d="M30 40l-8-26 22 16M90 40l8-26-22 16" fill="#c6f432" />
		<circle cx="60" cy="66" r="38" fill="#c6f432" />
		<path d="M38 56l14 6-14 6z M82 56l-14 6 14 6z" fill="#14080a" />
		<path d="M40 82q20 16 40 0l-6 4-6-4-6 4-6-4-6 4-6-4z" fill="#14080a" />
	{:else if id === 'serial-binger'}
		{#each [0, 1, 2] as i}<rect x={18 + i * 6} y={64 - i * 22} width={84 - i * 12} height="34" rx="6" fill={['#ff3ea5', '#ffe14d', '#2de2e6'][i]} stroke="#14080a" stroke-width="4" />{/each}
		<path d="M54 26l14 8-14 8z" fill="#14080a" />
	{:else if id === 'cinema-connoisseur'}
		<circle cx="60" cy="60" r="42" fill="#fff6e6" stroke="#14080a" stroke-width="5" />
		{#each Array.from({ length: 6 }) as _, i}<circle cx={60 + Math.cos((i * Math.PI) / 3) * 24} cy={60 + Math.sin((i * Math.PI) / 3) * 24} r="9" fill="#14080a" />{/each}
		<circle cx="60" cy="60" r="5" fill="#ff2d3d" />
	{:else if id === 'comfort-creature'}
		<path d="M60 98C26 74 18 58 18 44a20 20 0 0142-6 20 20 0 0142 6c0 14-8 30-42 54z" fill="#ff3ea5" stroke="#14080a" stroke-width="5" />
		<path d="M42 50a20 20 0 1136 10" fill="none" stroke="#fff6e6" stroke-width="6" stroke-linecap="round" />
		<path d="M74 52l6 10 8-8" fill="none" stroke="#fff6e6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
	{:else if id === 'genre-hopper'}
		<path d="M60 60L60 16A44 44 0 0198 38z" fill="#c6f432" /><path d="M60 60L98 38A44 44 0 0198 82z" fill="#ff3ea5" />
		<path d="M60 60L98 82A44 44 0 0160 104z" fill="#2de2e6" /><path d="M60 60L60 104A44 44 0 0122 82z" fill="#ffe14d" />
		<path d="M60 60L22 82A44 44 0 0122 38z" fill="#ff6a13" /><path d="M60 60L22 38A44 44 0 0160 16z" fill="#9b6bff" />
		<circle cx="60" cy="60" r="44" fill="none" stroke="#14080a" stroke-width="5" />
	{:else if id === 'deep-diver'}
		{#each [44, 32, 20, 8] as r, i}<circle cx="60" cy="60" r={r} fill={['#08123d', '#2448ff', '#2de2e6', '#fff6e6'][i]} />{/each}
		<path d="M60 4v26M50 20l10 10 10-10" fill="none" stroke="#ffe14d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
	{:else if id === 'hidden-gem-hunter'}
		<path d="M32 30h56l20 24-48 52-48-52z" fill="#2de2e6" stroke="#14080a" stroke-width="5" stroke-linejoin="round" />
		<path d="M12 54h96M44 30l-12 24 28 52 28-52-12-24M60 30v0" fill="none" stroke="#14080a" stroke-width="4" stroke-linejoin="round" />
		<path d="M96 12l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#ffe14d" />
	{:else if id === 'trend-chaser'}
		<path d="M66 8L26 66h28l-8 46 48-62H64z" fill="#ffe14d" stroke="#14080a" stroke-width="5" stroke-linejoin="round" />
	{:else if id === 'time-traveler'}
		<path d="M32 14h56M32 106h56" stroke="#14080a" stroke-width="8" stroke-linecap="round" />
		<path d="M38 18h44c0 26-18 30-18 42s18 16 18 42H38c0-26 18-30 18-42S38 44 38 18z" fill="#fff6e6" stroke="#14080a" stroke-width="5" stroke-linejoin="round" />
		<path d="M46 98h28c-4-14-14-18-14-24-0 6-10 10-14 24z" fill="#ff6a13" />
		<path d="M50 32h20l-10 14z" fill="#ff6a13" />
	{:else if id === 'weekend-warrior'}
		<rect x="14" y="54" width="92" height="34" rx="10" fill="#ff6a13" stroke="#14080a" stroke-width="5" />
		<rect x="24" y="34" width="72" height="28" rx="8" fill="#ff3ea5" stroke="#14080a" stroke-width="5" />
		<rect x="22" y="88" width="8" height="14" fill="#14080a" /><rect x="90" y="88" width="8" height="14" fill="#14080a" />
		<text x="60" y="80" text-anchor="middle" font-size="16" font-weight="900" fill="#14080a" font-family="var(--font-display)">SAT · SUN</text>
	{:else if id === 'completionist'}
		<circle cx="60" cy="60" r="46" fill="#c6f432" stroke="#14080a" stroke-width="5" />
		<path d="M36 62l16 16 32-34" fill="none" stroke="#14080a" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
	{:else if id === 'sampler'}
		{#each Array.from({ length: 9 }) as _, i}<rect x={18 + (i % 3) * 30} y={18 + Math.floor(i / 3) * 30} width="24" height="24" rx="6" fill={[0, 4, 8].includes(i) ? '#ff3ea5' : [2, 6].includes(i) ? '#2de2e6' : '#fff6e6'} stroke="#14080a" stroke-width="4" />{/each}
	{:else if id === 'tastemaker'}
		<path d="M30 100V64a20 20 0 01-6-38 26 26 0 0136-14 26 26 0 0136 14 20 20 0 01-6 38v36z" fill="#fff6e6" stroke="#14080a" stroke-width="5" stroke-linejoin="round" />
		<rect x="30" y="84" width="60" height="16" fill="#ff3ea5" stroke="#14080a" stroke-width="5" />
		<path d="M96 8l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#ffe14d" />
	{:else}
		<circle cx="60" cy="60" r="40" fill="currentColor" />
	{/if}
</svg>

<style>
	.emblem {
		display: block;
		overflow: visible;
	}
</style>
