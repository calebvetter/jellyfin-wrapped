/**
 * One shared audio player for the admin soundtrack page (Deezer previews, chosen tracks,
 * YouTube grabs, theme songs). Exposes `loading` while a clip is being fetched/buffered so
 * buttons can show three states: ▶ play · loading · ■ stop. Can play just a segment
 * (from → to), looping it like the story does.
 */
class AdminPlayer {
	current = $state<string | null>(null); // id of what's playing (or about to)
	loading = $state<string | null>(null); // id still buffering
	position = $state(0);
	private el: HTMLAudioElement | null = null;
	private raf = 0;
	private seq = 0;
	private segment: { from: number; to: number | null; loop: boolean } = { from: 0, to: null, loop: false };

	private ensure() {
		if (!this.el) {
			this.el = new Audio();
			this.el.addEventListener('ended', () => {
				if (this.segment.loop && this.el) {
					this.el.currentTime = this.segment.from;
					void this.el.play().catch(() => this.stop());
				} else this.stop();
			});
			this.el.addEventListener('playing', () => (this.loading = null));
			this.el.addEventListener('waiting', () => (this.loading = this.current));
		}
		return this.el;
	}

	private tick = () => {
		if (!this.el || !this.current) return;
		this.position = this.el.currentTime;
		const { from, to, loop } = this.segment;
		if (to !== null && this.el.currentTime >= to) {
			if (loop) this.el.currentTime = from;
			else return this.stop();
		}
		this.raf = requestAnimationFrame(this.tick);
	};

	state(id: string): 'idle' | 'loading' | 'playing' {
		if (this.current !== id) return 'idle';
		return this.loading === id ? 'loading' : 'playing';
	}

	/** Play `url` (optionally only from → to, looping); toggles off if `id` is already active. */
	async play(id: string, url: string, opts: { from?: number; to?: number | null; loop?: boolean } = {}) {
		if (this.current === id) return this.stop();
		const el = this.ensure();
		const run = ++this.seq;
		cancelAnimationFrame(this.raf);
		el.pause();
		this.current = id;
		this.loading = id;
		this.segment = { from: opts.from ?? 0, to: opts.to ?? null, loop: opts.loop ?? false };
		if (!el.src.endsWith(url)) el.src = url;
		try {
			if (this.segment.from) {
				if (el.readyState < 1) await new Promise((r) => el.addEventListener('loadedmetadata', r, { once: true }));
				el.currentTime = this.segment.from;
			}
			await el.play();
		} catch {
			if (run === this.seq) this.stop();
			return;
		}
		if (run !== this.seq) return;
		this.loading = null;
		this.raf = requestAnimationFrame(this.tick);
	}

	stop() {
		this.seq++;
		cancelAnimationFrame(this.raf);
		this.el?.pause();
		this.current = null;
		this.loading = null;
	}
}

export const adminPlayer = new AdminPlayer();
