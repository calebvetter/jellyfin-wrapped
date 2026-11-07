<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { adminPlayer } from '$lib/admin/player.svelte';
	import { fmtTime, grabYouTube, patchAudio, titleAction } from '$lib/admin/soundtrack-client';
	import SegmentEditor from '$lib/admin/SegmentEditor.svelte';
	import type { PageData } from './$types';

	type Title = PageData['titles'][number];
	type Album = Title['candidates'][number];

	let { t, youtube, onTouched }: { t: Title; youtube: PageData['youtube']; onTouched?: (key: string) => void } = $props();
	let ytUrl = $state('');
	let ytBusy = $state(false);
	let trimming = $state<string | null>(null); // audio id whose segment editor is open

	let busy = $state<string | null>(null);
	let selecting = $state<number | null>(null);
	let error = $state<string | null>(null);
	let showAllTracks = $state(false);
	let changing = $state(false);
	let query = $state('');
	let results = $state<Album[] | null>(null);

	const ROLE_LABELS: Record<string, string> = {
		top1: '#1',
		binge: 'binge',
		original: 'most obscure',
		genre: 'genre pick',
		top5: 'top 5',
		actor: 'actor slide',
		busiest: 'busiest day',
		requests: 'good taste'
	};
	const ROLE_ORDER = Object.keys(ROLE_LABELS);
	const roles = $derived(
		Object.entries(t.roles)
			.sort((a, b) => ROLE_ORDER.indexOf(a[0]) - ROLE_ORDER.indexOf(b[0]))
			.map(([r, n]) => `${ROLE_LABELS[r] ?? r} ×${n}`)
			.join(' · ')
	);
	const maxRank = $derived(Math.max(1, ...t.tracks.map((x) => x.rank)));
	const shownTracks = $derived(showAllTracks ? t.tracks : t.tracks.slice(0, 3));
	const selected = $derived(t.audio.find((a) => a.source !== 'theme') ?? null);
	const theme = $derived(t.audio.find((a) => a.source === 'theme') ?? null);
	const status = $derived(
		t.musicOff
			? { cls: '', text: 'No music' }
			: t.hasMusic
			? { cls: 'ok', text: selected ? 'Track chosen' : 'Theme song' }
			: t.status === 'none'
				? { cls: 'warn', text: 'No soundtrack found' }
				: t.status === 'error'
					? { cls: 'bad', text: 'Lookup failed' }
					: t.status === 'pending'
						? { cls: '', text: 'Not looked up yet' }
						: { cls: 'accent', text: 'Choose a track' }
	);

	async function run(label: string, fn: () => Promise<unknown>) {
		onTouched?.(t.key);
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

	async function use(trackId: number) {
		selecting = trackId;
		await run('Caching the 30-second preview…', () => titleAction(t.key, 'select', { trackId }));
		selecting = null;
	}

	async function grab() {
		ytBusy = true;
		await run('Grabbing audio from YouTube — this can take up to a minute…', async () => {
			await grabYouTube(t.key, ytUrl);
			ytUrl = '';
		});
		ytBusy = false;
	}

	const segmentLabel = (a: Title['audio'][number]) =>
		a.end !== null || a.start > 0 ? `plays ${fmtTime(a.start)}–${fmtTime(a.end ?? a.duration)}` : 'plays the whole clip';

	async function search() {
		busy = 'Searching Deezer…';
		error = null;
		try {
			results = (await titleAction<{ results: Album[] }>(t.key, 'search', { query })).results;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = null;
		}
	}
</script>

{#snippet playButton(id: string, url: string, idleLabel: string, name: string, from = 0, to: number | null = null)}
	{@const st = adminPlayer.state(id)}
	<button class="btn small play" class:active={st !== 'idle'} onclick={() => adminPlayer.play(id, url, { from, to, loop: to !== null || from > 0 })} aria-label="{st === 'idle' ? 'Play' : 'Stop'} {name}" aria-busy={st === 'loading'}>
		{#if st === 'loading'}
			<span class="spinner" aria-hidden="true"></span> Loading
		{:else if st === 'playing'}
			■ Stop
		{:else}
			▶ {idleLabel}
		{/if}
	</button>
{/snippet}

<article class="card title-card" id="t-{encodeURIComponent(t.key)}">
	<header>
		{#if t.poster}<img class="poster" src={t.poster} alt="" />{:else}<div class="poster"></div>{/if}
		<div class="meta">
			<h3>{t.title} {#if t.year}<span class="muted">({t.year})</span>{/if}</h3>
			<p class="muted">{t.kind === 'movie' ? 'Movie' : 'Series'} · in {t.users} Wrapped{t.users === 1 ? '' : 's'} · {roles}</p>
		</div>
		<span class="badge {status.cls}">{status.text}</span>
	</header>

	{#if t.musicOff}
	<div class="off-note">
		<p class="muted" style="margin:0">
			You chose <strong>no music</strong> for this title. Slides featuring it keep whatever music is already playing{theme ? ', and its Jellyfin theme song is ignored' : ''}.
		</p>
		<button class="btn small" disabled={!!busy} onclick={() => run('Saving…', () => titleAction(t.key, 'musicOn'))}>Choose music after all</button>
	</div>
	{#if error}<p class="alert bad" role="alert">{error}</p>{/if}
	{:else}
	<section class="album">
		{#if t.album}
			{#if t.album.cover}<img src={t.album.cover} alt="" class="cover" />{:else}<div class="cover"></div>{/if}
			<div class="album-meta">
				<strong>{t.album.title}</strong>
				<span class="muted">{t.album.artist ?? ''}{t.album.nbTracks ? ` · ${t.album.nbTracks} tracks` : ''}</span>
				{#if t.lowConfidence}<span class="badge warn">Unsure match — please confirm</span>{/if}
			</div>
			<div class="row">
				{#if t.status === 'auto'}<button class="btn small" disabled={!!busy} onclick={() => run('Confirming…', () => titleAction(t.key, 'confirm'))}>✓ Confirm album</button>{/if}
				<a class="btn small" href={t.album.link} target="_blank" rel="noreferrer noopener">Deezer ↗</a>
				<button class="btn small" onclick={() => (changing = !changing)}>{changing ? 'Close' : 'Change'}</button>
			</div>
		{:else}
			<p class="muted" style="margin:0;flex:1">
				{t.status === 'pending' ? 'Not looked up yet — it will be on the next preparation.' : t.status === 'error' ? 'The Deezer lookup failed.' : 'No soundtrack album found on Deezer.'}
			</p>
			<div class="row">
				<button class="btn small" disabled={!!busy} onclick={() => run('Looking up…', () => titleAction(t.key, 'lookup'))}>Look up again</button>
				<button class="btn small" onclick={() => (changing = !changing)}>{changing ? 'Close' : 'Search'}</button>
			</div>
		{/if}
	</section>

	{#if changing}
		<section class="change">
			<form
				class="row"
				onsubmit={(e) => {
					e.preventDefault();
					search();
				}}
			>
				<input type="text" placeholder="Search Deezer albums, e.g. “{t.title} soundtrack”" bind:value={query} style="flex:1" />
				<button class="btn small">Search</button>
				<button type="button" class="btn small danger" onclick={() => run('Saving…', () => titleAction(t.key, 'none')).then(() => (changing = false))}>No soundtrack exists</button>
			</form>
			<div class="albums">
				{#each results ?? t.candidates as a (a.id)}
					<button class="album-pick" class:current={t.album?.id === a.id} onclick={() => run('Loading tracks…', () => titleAction(t.key, 'choose', { albumId: a.id })).then(() => (changing = false))}>
						{#if a.cover}<img src={a.cover} alt="" />{:else}<span class="cover-ph"></span>{/if}
						<span><strong>{a.title}</strong><span class="muted">{a.artist ?? ''}{a.nbTracks ? ` · ${a.nbTracks} tracks` : ''}</span></span>
					</button>
				{:else}
					<p class="muted">No albums yet — search above.</p>
				{/each}
			</div>
		</section>
	{/if}

	{#if t.tracks.length}
		<section>
			<h4>Pick a track <span class="muted">· most popular first · plays its 30-second hook</span></h4>
			<table class="tracks">
				<tbody>
					{#each shownTracks as tr, i (tr.id)}
						{@const isSelected = t.selectedTrackId === tr.id}
						<tr class:selected={isSelected}>
							<td class="num muted">{i + 1}</td>
							<td class="pop"><div class="hbar"><i style:width="{(tr.rank / maxRank) * 100}%"></i></div></td>
							<td><strong>{tr.title}</strong> <span class="muted">— {tr.artist ?? ''}</span></td>
							<td class="num muted">{fmtTime(tr.duration)}</td>
							<td class="actions">
								{@render playButton(`dz-${tr.id}`, `/api/admin/soundtrack/preview/${tr.id}`, '30s', tr.title)}
								{#if isSelected}
									<span class="badge ok">✓ Selected</span>
								{:else}
									<button class="btn small {i === 0 && !t.hasMusic ? 'primary' : ''}" disabled={!!busy} onclick={() => use(tr.id)} aria-busy={selecting === tr.id}>
										{#if selecting === tr.id}<span class="spinner" aria-hidden="true"></span> Saving{:else}Use{/if}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if t.tracks.length > 3}
				<button class="btn small" style="margin-top:8px" onclick={() => (showAllTracks = !showAllTracks)}>{showAllTracks ? 'Show top 3' : `Show all ${t.tracks.length}`}</button>
			{/if}
		</section>
	{/if}

	<section class="yt">
		<h4>Or grab audio from YouTube <span class="muted">· any video, Short or youtu.be link — then choose the part to play</span></h4>
		{#if youtube.available}
			<form
				class="row"
				onsubmit={(e) => {
					e.preventDefault();
					grab();
				}}
			>
				<input type="url" placeholder="https://www.youtube.com/watch?v=…" bind:value={ytUrl} style="flex:1" aria-label="YouTube link for {t.title}" />
				<button class="btn small" disabled={!ytUrl.trim() || !!busy} aria-busy={ytBusy}>
					{#if ytBusy}<span class="spinner" aria-hidden="true"></span> Grabbing…{:else}Grab audio{/if}
				</button>
			</form>
		{:else}
			<p class="muted small" style="margin:0">
				yt-dlp isn't available on the server ({youtube.error ?? 'not found'}). The Docker image includes it; for development install it (e.g. <code>winget install yt-dlp</code>,
				<code>brew install yt-dlp</code> or <code>pip install "yt-dlp[default]"</code>) or set <code>YTDLP_PATH</code>.
			</p>
		{/if}
	</section>

	{#if busy && !selecting}<p class="alert" role="status">{#if ytBusy}<span class="spinner" aria-hidden="true"></span> {/if}{busy}</p>{/if}
	{#if error}<p class="alert bad" role="alert">{error}</p>{/if}

	{#if selected || theme}
		<section>
			<h4>Music in use</h4>
			{#if selected}
				<div class="audio">
					<div class="audio-head">
						<div>
							<strong>{selected.trackTitle ?? 'Selected track'}</strong>
							{#if selected.artist}<span class="muted">— {selected.artist}</span>{/if}
							<br />
							<span class="muted small">
								{#if selected.source === 'youtube'}
									From YouTube · {fmtTime(selected.duration)} long · {segmentLabel(selected)}
									{#if selected.sourceUrl}· <a href={selected.sourceUrl} target="_blank" rel="noreferrer noopener">open ↗</a>{/if}
								{:else}
									30-second Deezer preview, cached on this server · {segmentLabel(selected)}
								{/if}
							</span>
						</div>
						<div class="row">
							{@render playButton(selected.id, selected.url, 'Hear it', selected.trackTitle ?? 'track', selected.start, selected.end)}
							{#if selected.source !== 'youtube'}
								<button class="btn small" onclick={() => (trimming = trimming === selected.id ? null : selected.id)}>{trimming === selected.id ? 'Done' : 'Trim'}</button>
							{/if}
							<button class="btn small danger" disabled={!!busy} onclick={() => run('Removing…', () => titleAction(t.key, 'clear'))}>Remove</button>
						</div>
					</div>
					{#if selected.source === 'youtube' || trimming === selected.id}
						{#key `${selected.id}:${selected.start}:${selected.end}`}
							<SegmentEditor
								id={selected.id}
								url={selected.url}
								duration={selected.duration}
								start={selected.start}
								end={selected.end}
								onsave={async (s, e) => {
									onTouched?.(t.key);
									await patchAudio(selected.id, { start: s, end: e });
									await invalidateAll();
								}}
							/>
						{/key}
					{/if}
				</div>
			{/if}
			{#if theme}
				<div class="audio" class:off={!theme.enabled}>
					<div class="audio-head">
						<div>
							<strong>Jellyfin theme song</strong>
							<span class="muted"> · {fmtTime(theme.duration)} · {segmentLabel(theme)}</span>
							<br /><span class="muted small">{selected ? 'Used only if the selected track is removed' : 'From your server, used automatically'}</span>
						</div>
						<div class="row">
							{@render playButton(theme.id, theme.url, 'Hear it', 'theme song', theme.start, theme.end)}
							<button class="btn small" onclick={() => (trimming = trimming === theme.id ? null : theme.id)}>{trimming === theme.id ? 'Done' : 'Trim'}</button>
							<label class="row small"><input type="checkbox" checked={theme.enabled} onchange={(e) => run('Saving…', () => patchAudio(theme.id, { enabled: e.currentTarget.checked }))} /> Use</label>
						</div>
					</div>
					{#if trimming === theme.id}
						{#key `${theme.id}:${theme.start}:${theme.end}`}
							<SegmentEditor
								id={theme.id}
								url={theme.url}
								duration={theme.duration}
								start={theme.start}
								end={theme.end}
								onsave={async (s, e) => {
									await patchAudio(theme.id, { start: s, end: e });
									await invalidateAll();
								}}
							/>
						{/key}
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<div class="foot">
		<button
			class="btn small ghost"
			disabled={!!busy}
			onclick={() => {
				if (selected && !confirm(`Remove “${selected.trackTitle ?? 'the chosen track'}” and use no music for ${t.title}?`)) return;
				run('Saving…', () => titleAction(t.key, 'musicOff'));
			}}>Nothing good? Use no music for this title</button
		>
	</div>
	{/if}
</article>

<style>
	.title-card header {
		display: flex;
		align-items: flex-start;
		gap: 14px;
	}

	.poster {
		width: 48px;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 6px;
		flex-shrink: 0;
		background: var(--panel-2);
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.meta p {
		margin: 2px 0 0;
		font-size: 13px;
	}

	.album {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 14px;
		padding: 10px;
		border-radius: 12px;
		background: var(--panel-2);
	}

	.cover {
		width: 44px;
		height: 44px;
		border-radius: 6px;
		background: var(--bg);
		flex-shrink: 0;
	}

	.album-meta {
		flex: 1;
		min-width: 180px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.change {
		margin-top: 10px;
	}

	.albums {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 8px;
		margin-top: 10px;
	}

	.album-pick {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.album-pick.current {
		border-color: var(--accent);
	}

	.album-pick img,
	.cover-ph {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		flex-shrink: 0;
		background: var(--panel-2);
	}

	.album-pick span {
		display: flex;
		flex-direction: column;
		font-size: 13px;
		min-width: 0;
	}

	h4 {
		margin: 16px 0 6px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.tracks td {
		padding: 6px 8px;
	}

	.tracks tr.selected td {
		background: rgba(198, 244, 50, 0.06);
	}

	.pop {
		width: 70px;
	}

	.actions {
		text-align: right;
		white-space: nowrap;
	}

	.play {
		min-width: 86px;
		justify-content: center;
		margin-right: 6px;
	}

	.play.active {
		border-color: rgba(198, 244, 50, 0.5);
		color: var(--accent);
	}

	.spinner {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 2px solid currentColor;
		border-right-color: transparent;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.audio {
		padding: 12px;
		border-radius: 12px;
		background: var(--panel-2);
		margin-top: 8px;
	}

	.off-note {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--panel-2);
	}

	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}

	.ghost {
		background: none;
		color: var(--muted);
	}

	.ghost:hover:not(:disabled) {
		color: var(--text);
	}

	.audio-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.audio a {
		color: var(--accent);
	}

	.audio.off {
		opacity: 0.55;
	}

	.small {
		font-size: 12px;
	}

	.alert {
		margin: 10px 0 0;
	}
</style>
