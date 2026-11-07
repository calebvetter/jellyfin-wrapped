<script lang="ts">
	/**
	 * Choose the part of an audio file a Wrapped plays: drag the two handles (or the whole
	 * highlighted region) on the waveform, or type exact times. Works for short clips too —
	 * anything shorter than a slide loops smoothly in the story.
	 */
	import { onMount } from 'svelte';
	import { adminPlayer } from './player.svelte';

	interface Props {
		id: string;
		url: string;
		duration: number | null;
		start: number;
		end: number | null;
		onsave: (start: number, end: number | null) => Promise<void>;
		/** Sound-effect mode: sub-second precision, previews play once instead of looping. */
		sfx?: boolean;
	}
	let { id, url, duration: knownDuration, start: savedStart, end: savedEnd, onsave, sfx = false }: Props = $props();

	const MIN = $derived(sfx ? 0.05 : 1.5);
	const STEP = $derived(sfx ? 0.01 : 0.1);
	const SLIDE_MIN = 14;
	let peaks = $state<number[]>([]);
	let duration = $state(0);
	let loadError = $state<string | null>(null);
	let start = $state(0);
	let end = $state(0);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let wave: HTMLDivElement;

	const savedEndOrDur = $derived(savedEnd ?? duration);
	const dirty = $derived(Math.abs(start - savedStart) > 0.04 || Math.abs(end - savedEndOrDur) > 0.04);
	const length = $derived(end - start);
	const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / Math.max(0.001, duration)) * 100}%`;
	const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(sfx ? 2 : 1).padStart(sfx ? 5 : 4, '0')}`;
	const playId = $derived(`seg-${id}`);

	onMount(async () => {
		start = savedStart;
		duration = knownDuration ?? 0;
		end = savedEnd ?? duration;
		try {
			const buf = await (await fetch(url)).arrayBuffer();
			const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
			const audio = await new Ctx(1, 1, 22050).decodeAudioData(buf);
			duration = audio.duration;
			if (savedEnd === null || end > duration) end = savedEnd ?? duration;
			const data = audio.getChannelData(0);
			const N = Math.min(600, Math.max(60, Math.round(duration * 12)));
			const step = Math.floor(data.length / N);
			const out: number[] = [];
			let max = 0;
			for (let i = 0; i < N; i++) {
				let p = 0;
				for (let j = i * step; j < (i + 1) * step; j += 4) p = Math.max(p, Math.abs(data[j]));
				out.push(p);
				max = Math.max(max, p);
			}
			peaks = out.map((p) => (max ? Math.max(3, (p / max) * 100) : 3));
		} catch {
			loadError = "Couldn't draw the waveform (you can still type the times)";
		}
	});

	// ---------------------------------------------------------------- dragging
	let drag: { mode: 'start' | 'end' | 'move'; offset: number } | null = null;
	const timeAt = (x: number) => {
		const r = wave.getBoundingClientRect();
		return Math.max(0, Math.min(duration, ((x - r.left) / r.width) * duration));
	};
	const round = (t: number) => Number((Math.round(t / STEP) * STEP).toFixed(2));

	function down(e: PointerEvent, mode?: 'start' | 'end') {
		if (!duration) return;
		e.preventDefault();
		const t = timeAt(e.clientX);
		if (mode) drag = { mode, offset: 0 };
		else if (t > start && t < end) drag = { mode: 'move', offset: t - start };
		else drag = { mode: Math.abs(t - start) < Math.abs(t - end) ? 'start' : 'end', offset: 0 };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		move(e);
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const t = timeAt(e.clientX);
		if (drag.mode === 'start') start = round(Math.min(t, end - MIN));
		else if (drag.mode === 'end') end = round(Math.max(t, start + MIN));
		else {
			const len = end - start;
			start = round(Math.max(0, Math.min(duration - len, t - drag.offset)));
			end = round(start + len);
		}
	}

	function up() {
		drag = null;
	}

	function key(e: KeyboardEvent, which: 'start' | 'end') {
		const step = e.shiftKey ? 1 : 0.1;
		const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
		if (!d) return;
		e.preventDefault();
		if (which === 'start') start = round(Math.max(0, Math.min(end - MIN, start + d)));
		else end = round(Math.min(duration, Math.max(start + MIN, end + d)));
	}

	async function save() {
		saving = true;
		saveError = null;
		try {
			await onsave(start, end >= duration - 0.05 ? null : end);
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<div class="seg">
	<div
		class="wave"
		bind:this={wave}
		role="group"
		aria-label="Segment chooser"
		onpointerdown={(e) => down(e)}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		<div class="bars" aria-hidden="true">
			{#each peaks as p, i}
				{@const t = ((i + 0.5) / peaks.length) * duration}
				<i class:in={t >= start && t <= end} style:height="{p}%"></i>
			{/each}
		</div>
		{#if duration}
			<div class="region" style:left={pct(start)} style:width="calc({pct(end)} - {pct(start)})"></div>
			<button
				type="button"
				class="handle"
				style:left={pct(start)}
				role="slider"
				aria-label="Segment start"
				aria-valuemin={0}
				aria-valuemax={Math.round(duration * 10) / 10}
				aria-valuenow={start}
				aria-valuetext={fmt(start)}
				onpointerdown={(e) => {
					e.stopPropagation();
					down(e, 'start');
				}}
				onkeydown={(e) => key(e, 'start')}><span>{fmt(start)}</span></button
			>
			<button
				type="button"
				class="handle end"
				style:left={pct(end)}
				role="slider"
				aria-label="Segment end"
				aria-valuemin={0}
				aria-valuemax={Math.round(duration * 10) / 10}
				aria-valuenow={end}
				aria-valuetext={fmt(end)}
				onpointerdown={(e) => {
					e.stopPropagation();
					down(e, 'end');
				}}
				onkeydown={(e) => key(e, 'end')}><span>{fmt(end)}</span></button
			>
			{#if adminPlayer.current === playId}<div class="playhead" style:left={pct(adminPlayer.position)}></div>{/if}
		{/if}
	</div>
	{#if loadError}<p class="muted small">{loadError}</p>{/if}

	<div class="row controls">
		<label class="row small">Start <input type="number" min="0" max={duration} step={STEP} bind:value={start} /></label>
		<label class="row small">End <input type="number" min={start + MIN} max={duration} step={STEP} bind:value={end} /></label>
		<span class="muted small">
			{length.toFixed(sfx ? 2 : 1)} s of {duration.toFixed(sfx ? 2 : 1)} s{!sfx && length < SLIDE_MIN ? ' · shorter than a slide, so it loops' : ''}
		</span>
		<span class="spacer"></span>
		<button type="button" class="btn small" onclick={() => ((start = 0), (end = duration))}>Whole clip</button>
		<button
			type="button"
			class="btn small play"
			class:active={adminPlayer.state(playId) !== 'idle'}
			onclick={() => adminPlayer.play(playId, url, { from: start, to: end, loop: !sfx })}
		>
			{#if adminPlayer.state(playId) === 'loading'}<span class="spinner" aria-hidden="true"></span> Loading{:else if adminPlayer.state(playId) === 'playing'}■ Stop{:else}▶ Play segment{/if}
		</button>
		<button type="button" class="btn small primary" disabled={!dirty || saving} onclick={save}>{saving ? 'Saving…' : dirty ? 'Save segment' : 'Saved'}</button>
	</div>
	{#if saveError}<p class="alert bad" role="alert">{saveError}</p>{/if}
</div>

<style>
	.seg {
		margin-top: 28px; /* room for the start-time label above the handle */
	}

	.wave {
		position: relative;
		height: 72px;
		border-radius: 10px;
		background: #08060c;
		border: 1px solid var(--line);
		cursor: pointer;
		touch-action: none;
		user-select: none;
	}

	.bars {
		position: absolute;
		inset: 8px 6px;
		display: flex;
		align-items: center;
		gap: 1px;
		pointer-events: none;
	}

	.bars i {
		flex: 1;
		min-width: 1px;
		border-radius: 1px;
		background: rgba(255, 255, 255, 0.2);
	}

	.bars i.in {
		background: var(--accent);
	}

	.region {
		position: absolute;
		top: 0;
		bottom: 0;
		background: rgba(198, 244, 50, 0.1);
		border-top: 2px solid rgba(198, 244, 50, 0.5);
		border-bottom: 2px solid rgba(198, 244, 50, 0.5);
		cursor: grab;
		pointer-events: none;
	}

	.handle {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 14px;
		margin-left: -7px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: var(--accent);
		cursor: ew-resize;
		touch-action: none;
	}

	.handle::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 30%;
		bottom: 30%;
		width: 4px;
		border-left: 1px solid rgba(0, 0, 0, 0.5);
		border-right: 1px solid rgba(0, 0, 0, 0.5);
	}

	.handle span {
		position: absolute;
		bottom: calc(100% + 2px);
		left: 50%;
		transform: translateX(-50%);
		padding: 1px 5px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.8);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		white-space: nowrap;
	}

	.handle.end span {
		bottom: auto;
		top: calc(100% + 2px);
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: #ff3ea5;
		pointer-events: none;
	}

	.controls {
		margin-top: 22px;
	}

	.controls input {
		width: 82px;
	}

	.spacer {
		flex: 1;
	}

	.small {
		font-size: 12px;
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
</style>
