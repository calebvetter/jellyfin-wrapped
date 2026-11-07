<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { adminPlayer } from '$lib/admin/player.svelte';
	import { selectTopTracks } from '$lib/admin/soundtrack-client';
	import TitleCard from './TitleCard.svelte';
	import GenericMusic from './GenericMusic.svelte';

	let { data } = $props();

	type Filter = 'all' | 'needs' | 'ready' | 'none';
	let filter = $state<Filter>('needs');
	let q = $state('');
	// cards you just worked on stay visible (with their messages) until the filter changes
	let pinned = $state<Set<string>>(new Set());
	function setFilter(f: Filter) {
		filter = f;
		pinned = new Set();
	}

	// "No music": confirmed by you, or no soundtrack exists — either way nothing left to decide
	const noMusic = (t: (typeof data.titles)[number]) => !t.hasMusic && (t.musicOff || t.status === 'none');
	const needs = (t: (typeof data.titles)[number]) => !t.hasMusic && !noMusic(t);
	const counts = $derived({
		all: data.titles.length,
		needs: data.titles.filter(needs).length,
		ready: data.titles.filter((t) => t.hasMusic).length,
		none: data.titles.filter(noMusic).length
	});
	const shown = $derived(
		data.titles.filter((t) => {
			if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
			if (pinned.has(t.key)) return true;
			if (filter === 'needs') return needs(t);
			if (filter === 'ready') return t.hasMusic;
			if (filter === 'none') return noMusic(t);
			return true;
		})
	);
	const pct = (x: number) => `${Math.round(x * 100)}%`;
	const pickable = $derived(data.titles.filter((t) => !t.hasMusic && !t.musicOff && t.tracks.length > 0).length);

	let bulk = $state<string | null>(null);
	async function useTopTracks() {
		if (!confirm(`Use the most popular track for ${pickable} title${pickable === 1 ? '' : 's'} that don't have music yet? You can change any of them afterwards.`)) return;
		bulk = `Caching ${pickable} previews…`;
		try {
			const r = await selectTopTracks();
			await invalidateAll();
			bulk = `Done: ${r.selected} track${r.selected === 1 ? '' : 's'} selected${r.failed ? `, ${r.failed} failed (try those individually)` : ''}.`;
		} catch (e) {
			bulk = (e as Error).message;
		}
	}

	onMount(() => () => adminPlayer.stop());
</script>

<svelte:head><title>Soundtrack · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Soundtrack</h1>
		<p>
			Each Wrapped is scored with music from the movies and shows that person watched: their #1 show's theme on Top Shows, the binge series on the binge slide, and so on. Below
			are the titles that appear in this year's Wrappeds, most heard first, with the soundtrack tracks worth using. Pick one per title: its 30-second Deezer preview (the song's
			hook) is cached on this server and plays instantly.
		</p>
	</div>
</div>

{#if !data.year || !data.titles.length}
	<section class="card"><p class="muted">Prepare a year first — the soundtrack list is built from the titles that appear in prepared Wrappeds.</p></section>
	<GenericMusic generic={data.generic} youtube={data.youtube} />
{:else}
	<section class="card">
		<div class="stats">
			<div class="stat"><span class="v">{data.stats.withMusic}/{data.stats.titles}</span><span class="k">Titles with music</span></div>
			<div class="stat"><span class="v">{pct(data.stats.coverage)}</span><span class="k">Of music moments covered</span></div>
			<div class="stat"><span class="v">{data.stats.usersWithMusic}/{data.stats.reports}</span><span class="k">Wrappeds with their own music</span></div>
		</div>
		<p class="muted" style="margin:12px 0 0">
			“Music moments” weighs each title by how often and how prominently it appears (a #1 counts most). Users without any of their own music hear the server's most-featured
			tracks. Jellyfin theme songs are picked up automatically during preparation.
			{#if !data.deezer}<strong>Deezer lookups are disabled (DEEZER_ENABLED=false) — only Jellyfin theme songs will play.</strong>{/if}
		</p>
		{#if pickable}
			<div class="row" style="margin-top:12px">
				<button class="btn primary" disabled={bulk?.startsWith('Caching')} onclick={useTopTracks}>Use the most popular track for {pickable} title{pickable === 1 ? '' : 's'} without music</button>
			</div>
		{/if}
		{#if bulk}<p class="alert {bulk.startsWith('Done') ? 'ok' : ''}" style="margin:10px 0 0" role="status">{bulk}</p>{/if}
	</section>

	<GenericMusic generic={data.generic} youtube={data.youtube} />

	<h2 class="section-title">Music per title</h2>

	<div class="row toolbar">
		<div class="tabs" role="tablist" aria-label="Filter titles">
			{#each [['needs', 'Needs music'], ['ready', 'Has music'], ['none', 'No music'], ['all', 'All']] as [id, label]}
				<button role="tab" aria-selected={filter === id} class="tab" class:on={filter === id} onclick={() => setFilter(id as Filter)}>{label} <span>{counts[id as Filter]}</span></button>
			{/each}
		</div>
		<input type="text" placeholder="Search titles" bind:value={q} aria-label="Search titles" />
	</div>

	{#each shown as t (t.key)}
		<TitleCard {t} youtube={data.youtube} onTouched={(k) => (pinned = new Set([...pinned, k]))} />
	{:else}
		<section class="card"><p class="muted">Nothing here{filter === 'needs' ? ' — every featured title has music or is marked “no music”. 🎉' : '.'}</p></section>
	{/each}
{/if}

<style>
	.section-title {
		margin: 28px 0 0;
		font-size: 18px;
	}

	.toolbar {
		justify-content: space-between;
		margin: 18px 0 12px;
	}

	.tabs {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.tab {
		padding: 7px 14px;
		border-radius: 99px;
		border: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font-weight: 600;
		cursor: pointer;
	}

	.tab.on {
		background: rgba(198, 244, 50, 0.12);
		border-color: rgba(198, 244, 50, 0.4);
		color: var(--accent);
	}

	.tab span {
		margin-left: 4px;
		opacity: 0.7;
	}

	:global(.title-card) {
		margin-top: 12px !important;
	}
</style>
