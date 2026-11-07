/**
 * Lightweight engagement tracker. Accumulates per-slide deltas in memory and flushes
 * them on navigation (at most every 8 s), every 20 s while playing, on completion, and
 * when the page is hidden (sendBeacon) — so abandoned sessions still get recorded.
 * Never constructed for admin previews or mock previews.
 */

interface SlideDelta {
	index: number;
	enters: number;
	dwellMs: number;
	skips: number;
	revisits: number;
}

function rid(): string {
	const a = new Uint8Array(16);
	crypto.getRandomValues(a);
	return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stored(storage: () => Storage, key: string, ttlMs?: number): string {
	try {
		const s = storage();
		const raw = s.getItem(key);
		if (raw) {
			const [id, ts] = raw.split('|');
			if (id && (!ttlMs || Date.now() - Number(ts) < ttlMs)) {
				s.setItem(key, `${id}|${Date.now()}`);
				return id;
			}
		}
		const id = rid();
		s.setItem(key, `${id}|${Date.now()}`);
		return id;
	} catch {
		return rid();
	}
}

export class Tracker {
	private visit = rid();
	private session = stored(() => sessionStorage, 'jw.session', 30 * 60_000);
	private device = stored(() => localStorage, 'jw.device');
	private deltas = new Map<string, SlideDelta>();
	private seenThisPass = new Set<string>();
	private furthest = 0;
	private completed = false;
	private rewatches = 0;
	private activeMs = 0;
	private dirty = false;
	private timer: number | undefined;
	private current: { id: string; index: number; since: number; accumulated: number } | null = null;
	private running = false;
	private lastFlush = 0;

	constructor(private token: string) {
		this.timer = window.setInterval(() => this.flush(false), 20_000);
		document.addEventListener('visibilitychange', this.onVisibility);
		window.addEventListener('pagehide', this.onHide);
	}

	private onVisibility = () => {
		if (document.visibilityState === 'hidden') {
			this.setRunning(false);
			this.flush(true);
		}
	};

	private onHide = () => {
		this.setRunning(false);
		this.flush(true);
	};

	private delta(id: string, index: number): SlideDelta {
		let d = this.deltas.get(id);
		if (!d) this.deltas.set(id, (d = { index, enters: 0, dwellMs: 0, skips: 0, revisits: 0 }));
		return d;
	}

	/** Pause/resume dwell accounting (hold-to-pause, hidden tab). */
	setRunning(running: boolean) {
		if (!this.current) {
			this.running = running;
			return;
		}
		if (running && !this.running) this.current.since = performance.now();
		if (!running && this.running) this.current.accumulated += performance.now() - this.current.since;
		this.running = running;
	}

	enter(id: string, index: number) {
		const d = this.delta(id, index);
		d.enters++;
		if (this.seenThisPass.has(id)) d.revisits++;
		this.seenThisPass.add(id);
		this.furthest = Math.max(this.furthest, index);
		this.current = { id, index, since: performance.now(), accumulated: 0 };
		this.running = true;
		this.dirty = true;
		// piggy-back on navigation, but at most one request every 8 s
		if (Date.now() - this.lastFlush > 8000) this.flush(false);
	}

	/** Leave the current slide; `skipped` when the viewer tapped past it early. */
	exit(skipped: boolean) {
		if (!this.current) return;
		const c = this.current;
		const ms = c.accumulated + (this.running ? performance.now() - c.since : 0);
		const d = this.delta(c.id, c.index);
		d.dwellMs += Math.round(ms);
		if (skipped) d.skips++;
		this.activeMs += Math.round(ms);
		this.current = null;
		this.dirty = true;
	}

	complete() {
		if (!this.completed) {
			this.completed = true;
			this.dirty = true;
			this.flush(false);
		}
	}

	rewatch() {
		this.rewatches++;
		this.seenThisPass.clear();
		this.dirty = true;
	}

	flush(beacon: boolean) {
		// fold in-progress dwell so abandoned sessions still record time
		if (this.current) {
			const now = performance.now();
			const ms = this.current.accumulated + (this.running ? now - this.current.since : 0);
			this.current.since = now;
			this.current.accumulated = 0;
			if (ms > 0) {
				const d = this.delta(this.current.id, this.current.index);
				d.dwellMs += Math.round(ms);
				this.activeMs += Math.round(ms);
				this.dirty = true;
			}
		}
		if (!this.dirty) return;
		this.lastFlush = Date.now();
		const body = JSON.stringify({
			t: this.token,
			visit: this.visit,
			session: this.session,
			device: this.device,
			slides: Object.fromEntries(this.deltas),
			furthest: this.furthest,
			completed: this.completed,
			rewatches: this.rewatches,
			activeMs: this.activeMs
		});
		this.deltas.clear();
		this.rewatches = 0;
		this.activeMs = 0;
		this.dirty = false;
		try {
			if (beacon && navigator.sendBeacon) {
				navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
			} else {
				void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
			}
		} catch {
			/* analytics must never break the experience */
		}
	}

	destroy() {
		this.flush(true);
		window.clearInterval(this.timer);
		document.removeEventListener('visibilitychange', this.onVisibility);
		window.removeEventListener('pagehide', this.onHide);
	}
}
