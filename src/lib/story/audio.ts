/**
 * Story audio: per-user soundtrack (tracks from the user's own movies/shows) with smooth
 * crossfades, plus synthesized sound effects.
 *
 * - Must be unlocked from a user gesture (`unlock()` on the "tap to start" button).
 * - Two "decks" (HTMLAudioElement → MediaElementSource → GainNode) alternate like a DJ
 *   setup: the idle deck loads the next track, seeks to its best section, and fades in while
 *   the other fades out. Both decks are primed inside the start gesture so later play()
 *   calls are allowed on iOS; gain nodes are used because iOS ignores element.volume.
 * - A track that reaches its end loops back to its best section.
 * - Sound effects are generated with oscillators/noise — no bundled audio assets.
 */
import type { SfxName } from './context';
import { GENERIC_KEY, type MusicTrack } from '$shared/music';
import type { CustomSfx } from '$shared/sfx';

interface Deck {
	el: HTMLAudioElement;
	gain: GainNode;
	trackId: string | null;
	token: number;
	releasedAt: number;
}

const CROSSFADE = 1.6;
/** Volume dip (seconds each way) when a segment loops back to its start. */
const LOOP_FADE = 0.18;
const PAUSE_FADE = 0.25;

export class AudioDirector {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private musicBus: GainNode | null = null;
	private sfxBus: GainNode | null = null;
	private customBus: GainNode | null = null;
	private customSfx = new Map<string, { buffer: AudioBuffer; start: number; end: number | null; gain: number }>();

	/**
	 * Decode admin-replaced sound effects in the background (after unlock). Until one is
	 * ready — or if it fails to load — the built-in synthesized sound plays.
	 */
	loadCustomSfx(map: Partial<Record<SfxName, CustomSfx>>) {
		const ctx = this.ctx;
		if (!ctx) return;
		for (const [name, s] of Object.entries(map)) {
			if (!s) continue;
			fetch(s.url)
				.then((r) => r.arrayBuffer())
				.then((b) => ctx.decodeAudioData(b))
				.then((buffer) => this.customSfx.set(name, { buffer, start: s.start, end: s.end, gain: s.gain }))
				.catch(() => {});
		}
	}
	private decks: Deck[] = [];
	private active = -1;
	private noise: AudioBuffer | null = null;
	private byId: Map<string, MusicTrack>;
	/** Where each generic track was left off, so it picks up there when it comes back. */
	private resumeAt = new Map<string, number>();
	muted = false;
	paused = false;
	sfxEnabled = true;
	unlocked = false;
	/** Called when a new track becomes audible (for the "now playing" label). */
	onTrack: ((t: MusicTrack) => void) | null = null;

	constructor(tracks: MusicTrack[]) {
		this.byId = new Map(tracks.map((t) => [t.id, t]));
	}

	get hasMusic() {
		return this.byId.size > 0;
	}

	/** Call synchronously inside a user gesture handler. */
	unlock(muted: boolean, firstTrackId: string | null = null) {
		this.muted = muted;
		if (this.unlocked) return;
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		this.ctx = new Ctor();
		this.master = this.ctx.createGain();
		this.master.gain.value = muted ? 0 : 1;
		this.master.connect(this.ctx.destination);
		this.musicBus = this.ctx.createGain();
		this.musicBus.gain.value = 0.9;
		this.musicBus.connect(this.master);
		this.sfxBus = this.ctx.createGain();
		this.sfxBus.gain.value = 0.35;
		this.sfxBus.connect(this.master);
		this.customBus = this.ctx.createGain();
		this.customBus.gain.value = 0.8;
		this.customBus.connect(this.master);
		void this.ctx.resume();
		const first = (firstTrackId && this.byId.get(firstTrackId)) || this.byId.values().next().value;
		for (let i = 0; i < 2; i++) {
			const el = new Audio();
			el.preload = 'auto';
			const src = this.ctx.createMediaElementSource(el);
			const gain = this.ctx.createGain();
			gain.gain.value = 0;
			src.connect(gain).connect(this.musicBus);
			const deck: Deck = { el, gain, trackId: null, token: 0, releasedAt: 0 };
			el.addEventListener('ended', () => this.loopDeck(deck, true));
			this.decks.push(deck);
			// Prime inside the gesture so iOS allows play() later.
			if (first) {
				el.src = first.url;
				deck.trackId = first.id;
				el.muted = true;
				const primed = deck.token;
				el.play()
					.then(() => {
						// play() for the first slide usually lands before this resolves; pausing
						// then would silence it for good when the next slides use the same track
						if (deck.token === primed) el.pause();
						el.muted = false;
					})
					.catch(() => {
						el.muted = false;
					});
			}
		}
		this.unlocked = true;
		this.watchSegments();
	}

	private ramp(g: GainNode, to: number, seconds: number) {
		if (!this.ctx) return;
		const now = this.ctx.currentTime;
		g.gain.cancelScheduledValues(now);
		g.gain.setValueAtTime(g.gain.value, now);
		g.gain.linearRampToValueAtTime(to, now + seconds);
	}

	private load(deck: Deck, t: MusicTrack) {
		// note where the deck was (e.g. a generic track still fading out after a quick tap)
		if (deck.el.currentTime > 0) this.remember(deck);
		if (deck.trackId === t.id && deck.el.src) return;
		deck.trackId = t.id;
		deck.el.src = t.url;
		deck.el.load();
	}

	/** Load a track on the idle deck ahead of time so the next switch is instant. */
	prepare(trackId: string | null) {
		if (!trackId || !this.ctx) return;
		const t = this.byId.get(trackId);
		const idleIdx = this.active === 0 ? 1 : 0;
		const idle = this.decks[idleIdx];
		if (!t || !idle || this.decks[this.active]?.trackId === trackId) return;
		// don't steal a deck that is still fading out
		if (performance.now() - idle.releasedAt < CROSSFADE * 1000 + 300) return;
		this.load(idle, t);
	}

	/** Switch to a track (crossfade, starting at its best section). null keeps current music. */
	play(trackId: string | null, opts: { restart?: boolean } = {}) {
		if (!this.ctx || !trackId) return;
		const t = this.byId.get(trackId);
		if (!t) return;
		const cur = this.decks[this.active];
		if (cur && cur.trackId === trackId && !opts.restart) {
			// same music carries on; if something stopped it (e.g. the browser), pick it back up
			if (!this.paused && cur.el.paused) void cur.el.play().catch(() => {});
			return;
		}

		const nextIdx = this.active === 0 ? 1 : 0;
		const deck = this.decks[nextIdx];
		const token = ++deck.token;
		this.ramp(deck.gain, 0, 0.05);
		this.load(deck, t);
		let started = false;
		const begin = () => {
			if (started || deck.token !== token) return;
			started = true;
			try {
				deck.el.currentTime = this.startOf(t, opts.restart);
			} catch {
				/* not seekable yet; plays from 0 */
			}
			if (!this.paused) void deck.el.play().catch(() => {});
			const prev = this.decks[this.active];
			this.active = nextIdx;
			this.ramp(deck.gain, this.paused ? 0 : t.gain, CROSSFADE);
			if (prev && prev !== deck) {
				this.ramp(prev.gain, 0, CROSSFADE);
				prev.releasedAt = performance.now();
				const el = prev.el;
				window.setTimeout(() => {
					if (this.decks[this.active] !== prev) {
						el.pause();
						this.remember(prev);
					}
				}, CROSSFADE * 1000 + 100);
			}
			this.onTrack?.(t);
		};
		if (deck.el.readyState >= 1) begin();
		else {
			deck.el.addEventListener('loadedmetadata', begin, { once: true });
			window.setTimeout(begin, 2500); // never wait forever on a slow network
		}
	}

	/** Generic music resumes where it was left off (within its segment); everything else starts at its best section. */
	private startOf(t: MusicTrack, restart = false): number {
		const at = this.resumeAt.get(t.id);
		if (restart) this.resumeAt.delete(t.id);
		if (restart || at === undefined || t.titleKey !== GENERIC_KEY) return t.start;
		const end = t.end ?? Infinity;
		// too close to the segment end to be worth resuming: go round to the start
		return at > t.start && at < end - 2 ? at : t.start;
	}

	private remember(deck: Deck) {
		const t = deck.trackId ? this.byId.get(deck.trackId) : undefined;
		if (t?.titleKey === GENERIC_KEY && Number.isFinite(deck.el.currentTime)) this.resumeAt.set(t.id, deck.el.currentTime);
	}

	pause() {
		if (this.paused) return;
		this.paused = true;
		const deck = this.decks[this.active];
		if (!this.ctx || !deck) return;
		this.ramp(deck.gain, 0, PAUSE_FADE);
		window.setTimeout(() => {
			if (this.paused) for (const d of this.decks) d.el.pause();
		}, PAUSE_FADE * 1000 + 30);
	}

	resume() {
		if (!this.paused) return;
		this.paused = false;
		const deck = this.decks[this.active];
		if (!this.ctx || !deck || !deck.trackId) return;
		void this.ctx.resume();
		void deck.el.play().catch(() => {});
		this.ramp(deck.gain, this.byId.get(deck.trackId)?.gain ?? 0.9, 0.5);
	}

	setMuted(muted: boolean) {
		this.muted = muted;
		if (this.master) this.ramp(this.master, muted ? 0 : 1, 0.3);
	}

	/** Fade everything out (leaving the page / finishing). */
	fadeOut(seconds = 2) {
		const deck = this.decks[this.active];
		if (deck) this.ramp(deck.gain, 0, seconds);
	}

	// ---------------------------------------------------------------- segment looping

	private loopTimer: number | undefined;
	private looping = false;

	/**
	 * The active track plays only its chosen segment [start, end] and loops it — short clips
	 * (e.g. an 11 s sting under a 20 s slide) included. Each loop dips the volume briefly so
	 * the jump back is click-free.
	 */
	private watchSegments() {
		if (this.loopTimer !== undefined) return;
		this.loopTimer = window.setInterval(() => {
			const deck = this.decks[this.active];
			if (!deck?.trackId || this.paused || this.looping || deck.el.paused) return;
			const t = this.byId.get(deck.trackId);
			const end = t?.end ?? (Number.isFinite(deck.el.duration) ? deck.el.duration : null);
			if (end !== null && deck.el.currentTime >= end - LOOP_FADE) this.loopDeck(deck, false);
		}, 40);
	}

	private loopDeck(deck: Deck, ended: boolean) {
		if (this.decks[this.active] !== deck || !deck.trackId || this.looping) return;
		const t = this.byId.get(deck.trackId);
		if (!t) return;
		this.looping = true;
		const target = this.paused ? 0 : t.gain;
		const restart = () => {
			try {
				deck.el.currentTime = t.start;
			} catch {
				/* ignore */
			}
			if (!this.paused) void deck.el.play().catch(() => {});
			this.ramp(deck.gain, target, LOOP_FADE);
			window.setTimeout(() => (this.looping = false), LOOP_FADE * 1000);
		};
		if (ended) restart();
		else {
			this.ramp(deck.gain, 0, LOOP_FADE);
			window.setTimeout(restart, LOOP_FADE * 1000);
		}
	}

	destroy() {
		window.clearInterval(this.loopTimer);
		for (const d of this.decks) {
			d.el.pause();
			d.el.removeAttribute('src');
			d.el.load();
		}
		this.decks = [];
		void this.ctx?.close().catch(() => {});
		this.ctx = null;
	}

	// ------------------------------------------------------------------ sound effects

	private noiseBuffer(): AudioBuffer | null {
		if (!this.ctx) return null;
		if (this.noise) return this.noise;
		const len = this.ctx.sampleRate * 1.5;
		const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
		this.noise = buf;
		return buf;
	}

	private voices = new Map<string, { gain: GainNode; until: number }[]>();

	/** Quickly fade out a sound effect that is still playing (e.g. a drumroll cut short by a reveal). */
	stopSfx(name: SfxName, fade = 0.12) {
		if (!this.ctx) return;
		for (const v of this.voices.get(name) ?? []) this.ramp(v.gain, 0, fade);
		this.voices.delete(name);
	}

	sfx(name: SfxName, opts: { delay?: number; pitch?: number } = {}) {
		if (!this.ctx || !this.sfxBus || !this.sfxEnabled || this.muted || this.paused) return;
		const ctx = this.ctx;
		const t = ctx.currentTime + (opts.delay ?? 0);
		const pitch = opts.pitch ?? 1;
		const custom = this.customSfx.get(name);
		// every effect plays through its own "voice" gain so it can be cut short (stopSfx)
		const out = ctx.createGain();
		out.connect(custom && this.customBus ? this.customBus : this.sfxBus);
		const voices = this.voices.get(name) ?? [];
		this.voices.set(name, [...voices.filter((v) => v.until > ctx.currentTime), { gain: out, until: t + 8 }]);

		// admin-replaced sound effect (decoded ahead of time); otherwise synthesize below
		if (custom && this.customBus) {
			const src = ctx.createBufferSource();
			src.buffer = custom.buffer;
			src.playbackRate.value = pitch;
			const g = ctx.createGain();
			g.gain.value = custom.gain;
			src.connect(g).connect(out);
			const end = Math.min(custom.end ?? custom.buffer.duration, custom.buffer.duration);
			src.start(t, Math.min(custom.start, custom.buffer.duration), Math.max(0.03, end - custom.start));
			return;
		}

		const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = t) => {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = type;
			o.frequency.setValueAtTime(f0 * pitch, at);
			o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), at + dur);
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
			g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
			o.connect(g).connect(out);
			o.start(at);
			o.stop(at + dur + 0.05);
		};
		const noise = (dur: number, vol: number, f0: number, f1: number, q = 1, at = t, type: BiquadFilterType = 'bandpass') => {
			const buf = this.noiseBuffer();
			if (!buf) return;
			const s = ctx.createBufferSource();
			s.buffer = buf;
			const f = ctx.createBiquadFilter();
			f.type = type;
			f.Q.value = q;
			f.frequency.setValueAtTime(f0, at);
			f.frequency.exponentialRampToValueAtTime(f1, at + dur);
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, at);
			g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.35);
			g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
			s.connect(f).connect(g).connect(out);
			s.start(at);
			s.stop(at + dur + 0.05);
		};

		switch (name) {
			case 'whoosh':
				noise(0.45, 0.5, 300, 4200, 0.8);
				break;
			case 'pop':
				tone('sine', 660, 1320, 0.12, 0.5);
				break;
			case 'tick':
				tone('square', 1800, 1700, 0.03, 0.12);
				break;
			case 'reveal':
				[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', f, f, 0.5, 0.25, t + i * 0.06));
				break;
			case 'sparkle':
				[1568, 2093, 2637, 3136].forEach((f, i) => tone('sine', f, f * 1.01, 0.25, 0.12, t + i * 0.05));
				break;
			case 'stamp':
				tone('sine', 140, 40, 0.3, 0.9);
				noise(0.15, 0.6, 2000, 300, 0.7, t, 'lowpass');
				break;
			case 'thud':
				tone('sine', 110, 45, 0.25, 0.7);
				break;
			case 'drumroll': {
				for (let i = 0; i < 36; i++) {
					const at = t + i * 0.1 * (1 - i / 90);
					noise(0.07, 0.12 + i * 0.008, 900, 700, 1.5, at);
				}
				break;
			}
		}
	}
}
