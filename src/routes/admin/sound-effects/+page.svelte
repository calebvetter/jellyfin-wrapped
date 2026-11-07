<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { adminPlayer } from '$lib/admin/player.svelte';
	import { patchAudio } from '$lib/admin/soundtrack-client';
	import SegmentEditor from '$lib/admin/SegmentEditor.svelte';
	import { AudioDirector } from '$lib/story/audio';
	import type { SfxName } from '$shared/sfx';

	let { data } = $props();

	const ACCEPT = '.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.webm,.flac,audio/*';

	let busy = $state<Record<string, string>>({});
	let errors = $state<Record<string, string>>({});
	let ytUrls = $state<Record<string, string>>({});
	let ytOpen = $state<Record<string, boolean>>({});
	let trimming = $state<string | null>(null);

	// the built-in sounds are synthesized live by the story's own audio engine
	let synth: AudioDirector | null = null;
	function playDefault(name: SfxName) {
		adminPlayer.stop();
		if (!synth) {
			synth = new AudioDirector([]);
			synth.unlock(false);
		}
		synth.sfx(name);
	}

	/** Duration of a local audio file, decoded in the browser (null if it can't be decoded). */
	async function decodedDuration(file: File): Promise<number | null> {
		try {
			const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
			return (await new Ctx(1, 1, 22050).decodeAudioData(await file.arrayBuffer())).duration;
		} catch {
			return null;
		}
	}

	async function run(name: string, label: string, fn: () => Promise<unknown>, after?: () => void) {
		busy = { ...busy, [name]: label };
		errors = { ...errors, [name]: '' };
		try {
			await fn();
			await invalidateAll();
			after?.();
		} catch (e) {
			errors = { ...errors, [name]: (e as Error).message };
		} finally {
			const { [name]: _, ...rest } = busy;
			busy = rest;
		}
	}

	async function send(name: string, init: RequestInit) {
		const res = await fetch(`/api/admin/sfx/${name}`, init);
		const body = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(body.error ?? 'Request failed');
		return body;
	}

	function upload(name: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > 15 * 1024 * 1024) {
			errors = { ...errors, [name]: 'That file is larger than 15 MB' };
			return;
		}
		run(
			name,
			'Uploading…',
			async () => {
				const form = new FormData();
				form.set('file', file);
				const d = await decodedDuration(file);
				if (d) form.set('duration', String(d));
				await send(name, { method: 'POST', body: form });
			},
			() => (trimming = name)
		);
	}

	function grab(name: string) {
		const url = (ytUrls[name] ?? '').trim();
		if (!url) return;
		run(
			name,
			'Grabbing audio from YouTube — this can take up to a minute…',
			() => send(name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }),
			() => {
				ytUrls = { ...ytUrls, [name]: '' };
				ytOpen = { ...ytOpen, [name]: false };
				trimming = name;
			}
		);
	}

	const secs = (t: number) => (t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : t.toFixed(2));

	const replaced = $derived(data.sfx.filter((s) => s.custom).length);

	onMount(() => () => {
		adminPlayer.stop();
		synth?.destroy();
	});
</script>

<svelte:head><title>Sound effects · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Sound effects</h1>
		<p>
			The little sounds under the animations. Each one is synthesized by default; replace any of them with an audio file or a clip from YouTube, trim it to the exact moment, and
			reset whenever you like.
		</p>
	</div>
	<form method="POST" action="?/enabled" use:enhance class="row">
		<label class="row"><input type="checkbox" name="enabled" checked={data.sfxEnabled} onchange={(e) => e.currentTarget.form?.requestSubmit()} /> Sound effects on</label>
	</form>
</div>

{#if !data.sfxEnabled}
	<p class="alert" role="status">Sound effects are off — Wrappeds play music only. You can still set them up here.</p>
{/if}

<section class="card">
	<p class="muted" style="margin:0">
		{replaced ? `${replaced} of ${data.sfx.length} replaced.` : 'All built-in.'} Keep replacements short and punchy — they fire often, sometimes several times a second (Tick), and
		play at the moment the animation needs them.
	</p>
</section>

{#each data.sfx as s (s.id)}
	{@const c = s.custom}
	{@const working = busy[s.id]}
	<section class="card sfx" class:custom={c}>
		<div class="sfx-head">
			<div class="sfx-name">
				<h2>{s.label}</h2>
				<span class="muted small">{s.when}</span>
			</div>
			<div class="row actions">
				<button class="btn small" onclick={() => playDefault(s.id)} title="Play the built-in sound">▶ Built-in</button>
				{#if c}
					{@const st = adminPlayer.state(c.id)}
					<button class="btn small play" class:active={st !== 'idle'} onclick={() => adminPlayer.play(c.id, c.url, { from: c.start, to: c.end })}>
						{st === 'loading' ? 'Loading…' : st === 'playing' ? '■ Stop' : '▶ Yours'}
					</button>
				{/if}
				<label class="btn small" class:disabled={!!working}>
					{c ? 'Replace with a file' : 'Upload a file'}
					<input type="file" accept={ACCEPT} hidden disabled={!!working} onchange={(e) => upload(s.id, e.currentTarget)} />
				</label>
				{#if data.youtube.available}
					<button class="btn small" disabled={!!working} onclick={() => (ytOpen = { ...ytOpen, [s.id]: !ytOpen[s.id] })}>From YouTube</button>
				{/if}
			</div>
		</div>

		{#if ytOpen[s.id]}
			<form
				class="row yt"
				onsubmit={(e) => {
					e.preventDefault();
					grab(s.id);
				}}
			>
				<input type="url" placeholder="Paste a YouTube link" bind:value={ytUrls[s.id]} style="flex:1" aria-label="YouTube link for {s.label}" />
				<button class="btn small primary" disabled={!(ytUrls[s.id] ?? '').trim() || !!working}>Grab audio</button>
			</form>
		{/if}

		{#if working}<p class="alert" role="status"><span class="spinner" aria-hidden="true"></span> {working}</p>{/if}
		{#if errors[s.id]}<p class="alert bad" role="alert">{errors[s.id]}</p>{/if}

		{#if c}
			<div class="in-use">
				<div class="row">
					<span class="badge ok">Replaced</span>
					<span class="small">
						<strong>{c.name}</strong>
						<span class="muted">
							· {c.source === 'youtube' ? 'from YouTube' : 'uploaded'}
							{#if c.duration}· plays {secs(c.start)}–{secs(c.end ?? c.duration)} s ({((c.end ?? c.duration) - c.start).toFixed(2)} s){/if}
						</span>
					</span>
					<span class="spacer"></span>
					<label class="row small vol">
						Volume
						<input
							type="range"
							min="0"
							max="1.5"
							step="0.05"
							value={c.gain}
							aria-label="Volume for {s.label}"
							onchange={(e) => run(s.id, 'Saving…', () => patchAudio(c.id, { gain: Number(e.currentTarget.value) }))}
						/>
						<span class="muted">{Math.round(c.gain * 100)}%</span>
					</label>
					<button class="btn small" onclick={() => (trimming = trimming === s.id ? null : s.id)}>{trimming === s.id ? 'Done' : 'Trim'}</button>
					<button
						class="btn small danger"
						disabled={!!working}
						onclick={() => confirm(`Go back to the built-in ${s.label.toLowerCase()} sound?`) && run(s.id, 'Resetting…', () => send(s.id, { method: 'DELETE' }))}
						>Reset to default</button
					>
				</div>
				{#if trimming === s.id}
					{#key `${c.id}:${c.start}:${c.end}`}
						<SegmentEditor
							sfx
							id={c.id}
							url={c.url}
							duration={c.duration}
							start={c.start}
							end={c.end}
							onsave={async (st, en) => {
								await patchAudio(c.id, { start: st, end: en });
								await invalidateAll();
							}}
						/>
					{/key}
				{/if}
			</div>
		{/if}
	</section>
{/each}

{#if !data.youtube.available}
	<p class="muted small">Grabbing from YouTube needs yt-dlp on the server ({data.youtube.error ?? 'not found'}). It's included in the Docker image.</p>
{/if}

<style>
	.sfx-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.sfx-name h2 {
		margin: 0 0 2px;
		font-size: 17px;
	}

	.sfx.custom {
		border-color: rgba(198, 244, 50, 0.35);
	}

	.actions {
		flex-wrap: wrap;
		gap: 6px;
	}

	label.btn {
		cursor: pointer;
	}

	label.btn.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.yt {
		margin-top: 10px;
	}

	.in-use {
		margin-top: 12px;
		padding: 12px;
		border-radius: 12px;
		background: var(--panel-2);
	}

	.in-use > .row {
		flex-wrap: wrap;
		gap: 8px;
	}

	.vol input {
		width: 110px;
	}

	.spacer {
		flex: 1;
	}

	.small {
		font-size: 12px;
	}

	.play {
		min-width: 80px;
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
