<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { gsap } from 'gsap';
	import type { Slide, WrappedReport } from '$shared/report';
	import { SLIDE_LABELS } from '$shared/report';
	import { SLIDE_DURATION } from '$shared/timing';
	import type { MusicPlan, MusicTrack } from '$shared/music';
	import type { CustomSfx } from '$shared/sfx';
	import { localizeReport, viewerTimezone } from '$shared/clock';
	import { AudioDirector } from './audio';
	import { DEFERRED_MUSIC } from './context';
	import { Tracker } from './tracker';
	import { THEMES } from './themes';
	import SlideHost from './SlideHost.svelte';
	import Backdrop from './Backdrop.svelte';
	import Gate from './Gate.svelte';
	import type { SfxName } from './context';

	interface Props {
		report: WrappedReport;
		/** Per-user soundtrack: track per slide (from the user's own titles). */
		music?: MusicPlan;
		/** Admin-replaced sound effects (the rest are synthesized). */
		customSfx?: Partial<Record<SfxName, CustomSfx>>;
		trackingToken?: string | null;
		preview?: boolean;
		sfxEnabled?: boolean;
		/** Dev/screenshot helper: start at this slide index, skipping the gate. */
		startAt?: number | null;
		badge?: string | null;
		/** Dev/screenshot helper: never auto-advance. */
		hold?: boolean;
	}

	let { report: rawReport, music = { tracks: [], plan: [] }, customSfx = {}, trackingToken = null, preview = false, sfxEnabled = true, startAt = null, badge = null, hold = false }: Props = $props();

	// The clock follows the viewer's own timezone (set after mount, so SSR matches hydration)
	let viewerTz = $state<string | null>(null);
	const report = $derived(localizeReport(rawReport, viewerTz));

	// Slides plus the client-only outro (Rewatch) screen
	const slides: (Slide | null)[] = $derived([...report.slides, null]);
	const kindOf = (i: number) => slides[i]?.kind ?? 'outro';
	const durationOf = (i: number) => SLIDE_DURATION[kindOf(i)];

	let started = $state(false);
	let index = $state(0);
	let paused = $state(false);
	let holding = $state(false);
	let muted = $state(false);
	let elapsed = $state(0); // seconds on current slide
	let reducedMotion = $state(false);
	let layers = $state<{ key: number; index: number }[]>([]);
	let frameEl: HTMLDivElement | undefined = $state();
	let announce = $state('');
	let nowPlaying = $state<{ label: string; n: number } | null>(null);
	let nowPlayingTimer: number | undefined;

	let layerSeq = 0;
	let transitioning = false;
	let raf = 0;
	let last = 0;
	let audio: AudioDirector | null = null;
	let tracker: Tracker | null = null;
	const layerEls = new Map<number, HTMLElement>();

	const theme = $derived(THEMES[kindOf(index)]);

	function sfx(name: SfxName, opts?: { delay?: number; pitch?: number }) {
		if (started && !holding) audio?.sfx(name, opts);
	}

	function loop(t: number) {
		const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
		last = t;
		if (started && !paused && !transitioning && !hold) {
			const dur = durationOf(index);
			if (dur > 0) {
				elapsed = Math.min(dur, elapsed + dt);
				if (elapsed >= dur) go(index + 1, 'auto');
			}
		}
		raf = requestAnimationFrame(loop);
	}

	function layerAction(node: HTMLElement, key: number) {
		layerEls.set(key, node);
		return { destroy: () => layerEls.delete(key) };
	}

	type NavCause = 'tap' | 'key' | 'auto' | 'rewatch' | 'jump';

	async function go(to: number, cause: NavCause, origin?: { x: number; y: number }) {
		if (transitioning || to === index && cause !== 'rewatch') return;
		if (to < 0) {
			// tapping back on the first slide restarts it
			elapsed = 0;
			return;
		}
		if (to >= slides.length) return;
		const forward = to > index || cause === 'rewatch';
		const fromIndex = index;
		// Navigating while paused resumes playback (a paused global timeline would also freeze the transition).
		if (paused) {
			holding = false;
			setPaused(false);
		}

		// analytics
		if (tracker) {
			const skipped = forward && cause !== 'auto' && elapsed < durationOf(fromIndex) * 0.5;
			tracker.exit(skipped);
		}

		transitioning = true;
		const key = ++layerSeq;
		layers = [...layers, { key, index: to }];
		index = to;
		elapsed = 0;
		announce = `${SLIDE_LABELS[kindOf(to)]} — ${to + 1} of ${slides.length}`;
		onEnter(to, cause);
		await tick();
		const el = layerEls.get(key);
		const prev = layers.filter((l) => l.key !== key).map((l) => layerEls.get(l.key)).filter(Boolean) as HTMLElement[];
		const done = () => {
			layers = layers.filter((l) => l.key === key);
			transitioning = false;
		};
		if (!el || reducedMotion) {
			if (el) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, onComplete: done });
			else done();
			return;
		}
		const rect = frameEl?.getBoundingClientRect();
		const ox = origin && rect ? ((origin.x - rect.left) / rect.width) * 100 : forward ? 80 : 20;
		const oy = origin && rect ? ((origin.y - rect.top) / rect.height) * 100 : 50;
		if (forward) {
			sfx('whoosh');
			gsap.fromTo(el, { clipPath: `circle(0% at ${ox}% ${oy}%)` }, { clipPath: `circle(150% at ${ox}% ${oy}%)`, duration: 0.85, ease: 'power3.inOut', onComplete: done });
			gsap.to(prev, { scale: 0.92, rotate: -2, filter: 'brightness(0.6)', duration: 0.85, ease: 'power3.inOut' });
		} else {
			gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power3.inOut', onComplete: done });
			gsap.to(prev, { xPercent: 20, filter: 'brightness(0.6)', duration: 0.6, ease: 'power3.inOut' });
		}
	}

	function onEnter(i: number, cause: NavCause) {
		const kind = kindOf(i);
		// deferred slides open on the music before them and switch on their cue (musicCue)
		const deferred = DEFERRED_MUSIC.includes(kind);
		audio?.play((deferred ? music.plan[i - 1] : music.plan[i]) ?? null, { restart: cause === 'rewatch' });
		// once the crossfade is done, load the track that comes next on the idle deck
		const upcoming = (deferred ? music.plan[i] : music.plan[i + 1]) ?? null;
		window.setTimeout(() => {
			if (index === i) audio?.prepare(upcoming);
		}, 1900);
		if (tracker) {
			tracker.enter(kind, i);
			if (kind === 'summary' || kind === 'outro') tracker.complete();
		}
	}

	/** A deferred-music slide reached its cue: crossfade into its own track. */
	function musicCue(i: number) {
		if (!started || index !== i) return; // a slide still animating out doesn't get a say
		audio?.play(music.plan[i] ?? null);
		const upcoming = music.plan[i + 1] ?? null;
		window.setTimeout(() => {
			if (index === i) audio?.prepare(upcoming);
		}, 1900);
	}

	/** Per-layer "next" interceptors (see StoryContext.interceptAdvance). */
	const advanceHandlers = new Map<number, () => boolean>();

	function next(cause: NavCause = 'tap', origin?: { x: number; y: number }) {
		// the current slide may use a manual "next" to skip to its reveal instead
		const current = layers[layers.length - 1];
		if (cause !== 'auto' && !transitioning && current && current.index === index && advanceHandlers.get(current.key)?.()) {
			if (paused) setPaused(false); // the reveal needs the timelines running
			return;
		}
		go(index + 1, cause, origin);
	}
	function prev(cause: NavCause = 'tap', origin?: { x: number; y: number }) {
		go(index - 1, cause, origin);
	}

	function setPaused(p: boolean) {
		if (paused === p) return;
		paused = p;
		if (p) {
			gsap.globalTimeline.pause();
			audio?.pause();
		} else {
			gsap.globalTimeline.resume();
			audio?.resume();
		}
		tracker?.setRunning(!p);
	}

	function showNowPlaying(t: MusicTrack) {
		window.clearTimeout(nowPlayingTimer);
		// generic (admin-chosen background) music has no label: show nothing for it
		if (!t.label) {
			nowPlaying = null;
			return;
		}
		nowPlaying = { label: t.label, n: (nowPlaying?.n ?? 0) + 1 };
		nowPlayingTimer = window.setTimeout(() => (nowPlaying = null), 5000);
	}

	function begin(withSound: boolean) {
		audio = new AudioDirector(music.tracks);
		audio.sfxEnabled = sfxEnabled;
		audio.onTrack = showNowPlaying;
		audio.unlock(!withSound, music.plan[0] ?? null);
		audio.loadCustomSfx(customSfx);
		muted = !withSound;
		try {
			localStorage.setItem('jw.muted', muted ? '1' : '0');
		} catch {
			/* ignore */
		}
		if (trackingToken && !preview) tracker = new Tracker(trackingToken);
		started = true;
		layers = [{ key: ++layerSeq, index: 0 }];
		index = 0;
		elapsed = 0;
		onEnter(0, 'jump');
		requestAnimationFrame(() => frameEl?.focus({ preventScroll: true }));
	}

	function rewatch() {
		tracker?.rewatch();
		go(0, 'rewatch');
	}

	function toggleMute() {
		muted = !muted;
		audio?.setMuted(muted);
		try {
			localStorage.setItem('jw.muted', muted ? '1' : '0');
		} catch {
			/* ignore */
		}
	}

	// ---------------------------------------------------------------- pointer: tap & hold
	let downAt = 0;
	let downPos: { x: number; y: number } | null = null;
	let holdTimer: number | undefined;

	function isInteractive(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest('button, a, [data-no-nav], input, label'));
	}

	function onPointerDown(e: PointerEvent) {
		if (!started || isInteractive(e.target) || e.button !== 0) return;
		downAt = performance.now();
		downPos = { x: e.clientX, y: e.clientY };
		holdTimer = window.setTimeout(() => {
			holding = true;
			setPaused(true);
		}, 220);
	}

	function onPointerUp(e: PointerEvent) {
		if (!downPos) return;
		window.clearTimeout(holdTimer);
		const wasHolding = holding;
		holding = false;
		const pos = downPos;
		downPos = null;
		if (wasHolding) {
			setPaused(false);
			return;
		}
		if (performance.now() - downAt > 600) return;
		const rect = frameEl!.getBoundingClientRect();
		const x = (pos.x - rect.left) / rect.width;
		if (x < 0.3) prev('tap', pos);
		else next('tap', { x: e.clientX, y: e.clientY });
	}

	function onPointerCancel() {
		window.clearTimeout(holdTimer);
		downPos = null;
		if (holding) {
			holding = false;
			setPaused(false);
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!started) return;
		if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
		switch (e.key) {
			case 'ArrowRight':
			case 'PageDown':
				e.preventDefault();
				next('key');
				break;
			case 'ArrowLeft':
			case 'PageUp':
				e.preventDefault();
				prev('key');
				break;
			case ' ':
			case 'k':
			case 'K':
			case 'p':
			case 'P':
				if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
				e.preventDefault();
				setPaused(!paused);
				break;
			case 'm':
			case 'M':
				toggleMute();
				break;
			case 'Home':
				go(0, 'jump');
				break;
		}
	}

	function onVisibility() {
		if (document.visibilityState === 'hidden' && started) setPaused(true);
	}

	onMount(() => {
		viewerTz = viewerTimezone();
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onMq = () => (reducedMotion = mq.matches);
		mq.addEventListener('change', onMq);
		try {
			muted = localStorage.getItem('jw.muted') === '1';
		} catch {
			/* ignore */
		}
		if (startAt != null && startAt >= 0) {
			// screenshot/dev mode: no gate, no audio
			started = true;
			index = Math.min(startAt, slides.length - 1);
			layers = [{ key: ++layerSeq, index }];
		}
		raf = requestAnimationFrame(loop);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			mq.removeEventListener('change', onMq);
			document.removeEventListener('visibilitychange', onVisibility);
			cancelAnimationFrame(raf);
			gsap.globalTimeline.resume();
			tracker?.destroy();
			audio?.destroy();
		};
	});

	const progressFor = (i: number) => (i < index ? 1 : i > index ? 0 : durationOf(i) ? elapsed / durationOf(i) : 1);
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" style:--glow={theme.glow}>
	<Backdrop posters={report.backdrop} year={report.year} glow={theme.glow} />

	<div class="frame-wrap">
		{#if started}
			<button class="side-nav prev" onclick={() => prev('key')} aria-label="Previous slide" disabled={index === 0}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			</button>
		{/if}

		<div
			class="frame"
			bind:this={frameEl}
			role="region"
			aria-roledescription="story"
			aria-label="{report.userName}'s {report.year} Wrapped"
			tabindex="-1"
			style:background={theme.bg}
			onpointerdown={onPointerDown}
			onpointerup={onPointerUp}
			onpointercancel={onPointerCancel}
			onpointerleave={onPointerCancel}
			oncontextmenu={(e) => e.preventDefault()}
		>
			{#if !started}
				<Gate {report} onStart={begin} hasMusic={music.tracks.length > 0} />
			{:else}
				{#each layers as layer (layer.key)}
					<div class="layer" use:layerAction={layer.key} style:background={THEMES[kindOf(layer.index)].bg} style:color={THEMES[kindOf(layer.index)].fg}>
						<SlideHost
							slide={slides[layer.index]}
							{report}
							{reducedMotion}
							duration={durationOf(layer.index)}
							{preview}
							{sfx}
							onRewatch={rewatch}
							onMusicCue={() => musicCue(layer.index)}
							stopSfx={(name) => audio?.stopSfx(name)}
							setAdvanceHandler={(h) => (h ? advanceHandlers.set(layer.key, h) : advanceHandlers.delete(layer.key))}
						/>
					</div>
				{/each}

				<div class="chrome" style:color={theme.fg}>
					<div class="bars" aria-hidden="true">
						{#each slides as _, i}
							<div class="bar"><div class="fill" style:transform="scaleX({progressFor(i)})"></div></div>
						{/each}
					</div>
					<div class="topline">
						<span class="brand">
							<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 22c10-12 26-12 36 0-4 2-6 6-6 10s2 8 6 10c-10 12-26 12-36 0 4-2 6-6 6-10s-2-8-6-10z" fill="currentColor" /></svg>
							{report.year} Wrapped
						</span>
						{#if badge}<span class="badge">{badge}</span>{/if}
						<span class="spacer"></span>
						<button class="icon" onclick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}>
							{#if paused}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
							{/if}
						</button>
						<button class="icon" onclick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}>
							{#if muted}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" /></svg>
							{/if}
						</button>
					</div>
				</div>

				{#if nowPlaying && !muted}
					{#key nowPlaying.n}
						<div class="now-playing" style:color={theme.fg} role="status">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>
							<span class="np-label"><span class="sr-only">Now playing: </span>{nowPlaying.label}</span>
						</div>
					{/key}
				{/if}

				<div class="paused-indicator" class:show={holding} aria-hidden="true">
					<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>
				</div>
			{/if}
			<div class="sr-only" aria-live="polite">{announce}</div>
		</div>

		{#if started}
			<button class="side-nav next" onclick={() => next('key')} aria-label="Next slide" disabled={index >= slides.length - 1}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</button>
		{/if}
	</div>

	<p class="hint" aria-hidden="true">Tap or ← → to navigate · hold or space to pause · M to mute</p>
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: #07030d;
	}

	.frame-wrap {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.frame {
		position: relative;
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
		container-type: size;
		container-name: story;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		outline: none;
		isolation: isolate;
		transition: background 0.6s;
	}

	@media (min-width: 640px) and (min-height: 560px) {
		.frame {
			height: min(calc(100dvh - 72px), 920px);
			width: calc(min(calc(100dvh - 72px), 920px) * 9 / 16);
			border-radius: 28px;
			box-shadow:
				0 0 0 1px rgba(255, 255, 255, 0.08),
				0 40px 120px -20px color-mix(in srgb, var(--glow) 55%, transparent),
				0 30px 80px rgba(0, 0, 0, 0.6);
			transition:
				box-shadow 0.8s,
				background 0.6s;
		}
	}

	.layer {
		/* Design unit: 1% of frame width on tall phones; shrinks on shorter (e.g. 9:16) frames. */
		--u: min(1cqw, 0.4625cqh);
		position: absolute;
		inset: 0;
		overflow: hidden;
		will-change: clip-path, transform;
		transform-origin: 50% 50%;
	}

	.chrome {
		position: absolute;
		inset: 0 0 auto 0;
		z-index: 20;
		padding: max(10px, env(safe-area-inset-top)) 12px 0;
		pointer-events: none;
		transition: color 0.5s;
	}

	.bars {
		display: flex;
		gap: 4px;
	}

	.bar {
		flex: 1;
		height: 3px;
		border-radius: 3px;
		background: color-mix(in srgb, currentColor 28%, transparent);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: currentColor;
		transform-origin: 0 50%;
	}

	.topline {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.brand {
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.brand svg {
		width: 18px;
		height: 18px;
	}

	.badge {
		white-space: nowrap;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 99px;
		background: color-mix(in srgb, currentColor 16%, transparent);
	}

	.spacer {
		flex: 1;
	}

	.icon {
		pointer-events: auto;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: color-mix(in srgb, currentColor 12%, transparent);
		cursor: pointer;
	}

	.icon svg,
	.side-nav svg,
	.paused-indicator svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.now-playing {
		position: absolute;
		z-index: 21;
		top: calc(max(10px, env(safe-area-inset-top)) + 54px);
		left: 12px;
		max-width: calc(100% - 24px);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px 4px 8px;
		border-radius: 99px;
		background: color-mix(in srgb, currentColor 14%, transparent);
		backdrop-filter: blur(8px);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		pointer-events: none;
		animation: np-in 5s ease forwards;
	}

	.now-playing svg {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
	}

	.np-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@keyframes np-in {
		0% {
			opacity: 0;
			transform: translateY(-6px);
		}
		8%,
		85% {
			opacity: 1;
			transform: none;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.now-playing {
			animation: none;
		}
	}

	.paused-indicator {
		position: absolute;
		inset: 0;
		z-index: 25;
		display: grid;
		place-items: center;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s;
		color: #fff;
	}

	.paused-indicator.show {
		opacity: 1;
	}

	.paused-indicator svg {
		width: 64px;
		height: 64px;
		padding: 16px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(6px);
	}

	.side-nav {
		display: none;
	}

	.hint {
		display: none;
	}

	@media (min-width: 900px) and (min-height: 560px) {
		.side-nav {
			display: grid;
			place-items: center;
			width: 52px;
			height: 52px;
			border-radius: 50%;
			border: 1px solid rgba(255, 255, 255, 0.18);
			background: rgba(255, 255, 255, 0.06);
			color: #fff;
			cursor: pointer;
			backdrop-filter: blur(10px);
			transition:
				background 0.2s,
				transform 0.2s;
		}

		.side-nav:hover:not(:disabled) {
			background: rgba(255, 255, 255, 0.16);
			transform: scale(1.06);
		}

		.side-nav:disabled {
			opacity: 0.25;
			cursor: default;
		}

		.side-nav svg {
			width: 22px;
			height: 22px;
		}

		.hint {
			display: block;
			position: absolute;
			bottom: 10px;
			left: 0;
			right: 0;
			z-index: 2;
			margin: 0;
			text-align: center;
			font-size: 12px;
			letter-spacing: 0.04em;
			color: rgba(255, 255, 255, 0.45);
		}
	}
</style>
