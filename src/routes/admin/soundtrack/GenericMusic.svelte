<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { adminPlayer } from '$lib/admin/player.svelte';
	import { fmtTime } from '$lib/admin/soundtrack-client';
	import SegmentEditor from '$lib/admin/SegmentEditor.svelte';
	import { MUSIC_SLOTS } from '$shared/music';
	import type { PageData } from './$types';

	let { generic, youtube }: { generic: PageData['generic']; youtube: PageData['youtube'] } = $props();

	type Hit = { id: number; title: string; artist: string | null; duration: number; album: string | null; cover: string | null };

	let ytUrl = $state('');
	let query = $state('');
	let hits = $state<Hit[] | null>(null);
	let busy = $state<string | null>(null);
	let adding = $state<number | null>(null);
	let error = $state<string | null>(null);
	let trimming = $state<string | null>(null);

	async function api(body: Record<string, unknown>) {
		const res = await fetch('/api/admin/soundtrack/generic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.error ?? 'Request failed');
		return json;
	}

	async function run(label: string, fn: () => Promise<unknown>) {
		busy = label;
		error = null;
		try {
			await fn();
			await invalidateAll();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = null;
		}
	}

	async function search() {
		busy = 'Searching Deezer…';
		error = null;
		try {
			hits = (await api({ action: 'search', query })).results;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = null;
		}
	}

	const label = (a: PageData['generic']['audio'][number]) => `${a.trackTitle ?? 'Track'}${a.artist ? ` — ${a.artist}` : ''}`;
	const usedIn = (id: string) =>
		MUSIC_SLOTS.filter((s) => generic.slots[s.id] === id)
			.map((s) => s.label)
			.join(', ');
</script>

{#snippet play(id: string, url: string, idle: string, from = 0, to: number | null = null)}
	{@const st = adminPlayer.state(id)}
	<button class="btn small play" class:active={st !== 'idle'} onclick={() => adminPlayer.play(id, url, { from, to, loop: to !== null || from > 0 })} aria-busy={st === 'loading'}>
		{#if st === 'loading'}<span class="spinner" aria-hidden="true"></span> Loading{:else if st === 'playing'}■ Stop{:else}▶ {idle}{/if}
	</button>
{/snippet}

<section class="card generic">
	<div class="card-head">
		<div>
			<h2>Generic music</h2>
			<p class="muted" style="margin:4px 0 0">
				For screens that aren't really about one movie or show. Add a few tracks, then choose where they play — unassigned screens keep using each person's own music.
			</p>
		</div>
	</div>

	<div class="grid cols-2">
		<div>
			<h4>Where it plays</h4>
			<table class="slots">
				<tbody>
					{#each MUSIC_SLOTS as s (s.id)}
						<tr>
							<td><strong>{s.label}</strong><br /><span class="muted small">{s.hint}</span></td>
							<td>
								<select
									aria-label="Music for {s.label}"
									value={generic.slots[s.id] ?? ''}
									disabled={!!busy}
									onchange={(e) => run('Saving…', () => api({ action: 'slot', slot: s.id, audioId: e.currentTarget.value || null }))}
								>
									<option value="">{s.id === 'fallback' ? 'Most-featured music (default)' : "Their own music (default)"}</option>
									{#each generic.audio as a (a.id)}<option value={a.id}>{label(a)}</option>{/each}
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div>
			<h4>Add a track</h4>
			{#if youtube.available}
				<form
					class="row"
					onsubmit={(e) => {
						e.preventDefault();
						run('Grabbing audio from YouTube — this can take up to a minute…', async () => {
							await api({ action: 'youtube', url: ytUrl });
							ytUrl = '';
						});
					}}
				>
					<input type="url" placeholder="YouTube link" bind:value={ytUrl} style="flex:1" aria-label="YouTube link for generic music" />
					<button class="btn small" disabled={!ytUrl.trim() || !!busy}>Grab audio</button>
				</form>
			{:else}
				<p class="muted small">yt-dlp isn't available on the server ({youtube.error ?? 'not found'}).</p>
			{/if}
			<form
				class="row"
				style="margin-top:8px"
				onsubmit={(e) => {
					e.preventDefault();
					search();
				}}
			>
				<input type="text" placeholder="…or search any song on Deezer" bind:value={query} style="flex:1" aria-label="Search Deezer songs" />
				<button class="btn small" disabled={!query.trim() || !!busy}>Search</button>
			</form>
			{#if hits}
				<ul class="hits">
					{#each hits as h (h.id)}
						<li>
							{#if h.cover}<img src={h.cover} alt="" />{:else}<span class="ph"></span>{/if}
							<span class="hit-meta"><strong>{h.title}</strong><span class="muted small">{h.artist ?? ''}{h.album ? ` · ${h.album}` : ''} · {fmtTime(h.duration)}</span></span>
							{@render play(`dz-${h.id}`, `/api/admin/soundtrack/preview/${h.id}`, '30s')}
							<button
								class="btn small"
								disabled={!!busy || adding !== null}
								onclick={async () => {
									adding = h.id;
									await run('Caching the 30-second preview…', () => api({ action: 'deezer', trackId: h.id }));
									adding = null;
								}}>{adding === h.id ? 'Adding…' : 'Add'}</button
							>
						</li>
					{:else}
						<li class="muted small">No songs found.</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	{#if busy}<p class="alert" role="status"><span class="spinner" aria-hidden="true"></span> {busy}</p>{/if}
	{#if error}<p class="alert bad" role="alert">{error}</p>{/if}

	{#if generic.audio.length}
		<h4>Generic tracks</h4>
		{#each generic.audio as a (a.id)}
			<div class="audio">
				<div class="audio-head">
					<div>
						<strong>{label(a)}</strong>
						<br /><span class="muted small">
							{a.source === 'youtube' ? 'From YouTube' : '30-second Deezer preview'} · {fmtTime(a.duration)} ·
							{a.end !== null || a.start > 0 ? `plays ${fmtTime(a.start)}–${fmtTime(a.end ?? a.duration)}` : 'plays the whole clip'}
							{#if usedIn(a.id)}· <span class="used">on {usedIn(a.id)}</span>{:else}· not assigned yet{/if}
						</span>
					</div>
					<div class="row">
						{@render play(a.id, a.url, 'Hear it', a.start, a.end)}
						<button class="btn small" onclick={() => (trimming = trimming === a.id ? null : a.id)}>{trimming === a.id ? 'Done' : 'Trim'}</button>
						<button
							class="btn small danger"
							disabled={!!busy}
							onclick={() =>
								confirm(`Remove “${label(a)}”${usedIn(a.id) ? ` (used on ${usedIn(a.id)})` : ''}?`) &&
								run('Removing…', async () => {
									const res = await fetch(`/api/admin/soundtrack/audio/${a.id}`, { method: 'DELETE' });
									if (!res.ok) throw new Error('Remove failed');
								})}>Remove</button
						>
					</div>
				</div>
				{#if trimming === a.id}
					{#key `${a.id}:${a.start}:${a.end}`}
						<SegmentEditor
							id={a.id}
							url={a.url}
							duration={a.duration}
							start={a.start}
							end={a.end}
							onsave={async (s, e) => {
								const res = await fetch(`/api/admin/soundtrack/audio/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: s, end: e }) });
								if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed');
								await invalidateAll();
							}}
						/>
					{/key}
				{/if}
			</div>
		{/each}
	{/if}
</section>

<style>
	h4 {
		margin: 14px 0 8px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.slots td {
		padding: 6px 8px;
	}

	.slots select {
		width: 100%;
		max-width: 320px;
	}

	.hits {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 6px;
		max-height: 340px;
		overflow: auto;
	}

	.hits li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px;
		border-radius: 10px;
		background: var(--panel-2);
	}

	.hits img,
	.ph {
		width: 36px;
		height: 36px;
		border-radius: 4px;
		flex-shrink: 0;
		background: var(--bg);
	}

	.hit-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-size: 13px;
	}

	.hit-meta strong {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.audio {
		padding: 12px;
		border-radius: 12px;
		background: var(--panel-2);
		margin-top: 8px;
	}

	.audio-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.used {
		color: var(--accent);
	}

	.small {
		font-size: 12px;
	}

	.play {
		min-width: 86px;
		justify-content: center;
	}

	.play.active {
		border-color: rgba(198, 244, 50, 0.5);
		color: var(--accent);
	}

	.spinner {
		display: inline-block;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 0.7s linear infinite;
		vertical-align: -1px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
