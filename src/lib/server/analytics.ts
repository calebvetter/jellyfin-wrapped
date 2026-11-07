/**
 * Privacy-conscious first-party engagement analytics.
 *
 * The player accumulates per-slide counters locally and flushes small *delta* batches
 * (on slide changes every ~20 s, on completion and on page hide via sendBeacon). No IPs or
 * user agents are stored; per-tab session ids and per-browser ids are random and hashed.
 * Admin previews never receive a tracking token, so they are never recorded.
 */
import { all, get, run, tx } from './db';
import { sign, tokenHash, verify } from './crypto';

export type ViewMode = 'login' | 'link';

interface TrackClaims {
	u: string; // user id
	y: number; // year
	m: ViewMode;
	n: number; // slide count
	exp: number;
}

const TOKEN_TTL_MS = 12 * 3_600_000;

export function issueTrackingToken(userId: string, year: number, mode: ViewMode, slideCount: number): string {
	return sign({ u: userId, y: year, m: mode, n: slideCount, exp: Date.now() + TOKEN_TTL_MS } satisfies TrackClaims, 'track');
}

export function verifyTrackingToken(token: string): TrackClaims | null {
	const c = verify<TrackClaims>(token, 'track');
	if (!c || typeof c.u !== 'string' || typeof c.y !== 'number' || c.exp < Date.now()) return null;
	if (c.m !== 'login' && c.m !== 'link') return null;
	return c;
}

export interface SlideDelta {
	index: number;
	enters?: number;
	dwellMs?: number;
	skips?: number;
	revisits?: number;
}

export interface EventBatch {
	t: string;
	visit: string;
	session: string;
	device: string;
	slides?: Record<string, SlideDelta>;
	furthest?: number;
	completed?: boolean;
	rewatches?: number;
	activeMs?: number;
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SLIDE_RE = /^[a-z0-9-]{2,32}$/;
const MAX_FLUSH_MS = 15 * 60_000;
const int = (x: unknown, max: number) => {
	const v = Math.floor(Number(x));
	return Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0;
};

export type IngestResult = { ok: true } | { ok: false; status: number; reason: string };

export function ingest(batch: EventBatch, now = Date.now()): IngestResult {
	if (!batch || typeof batch !== 'object') return { ok: false, status: 400, reason: 'bad batch' };
	const claims = verifyTrackingToken(batch.t);
	if (!claims) return { ok: false, status: 401, reason: 'bad token' };
	if (!ID_RE.test(batch.visit ?? '') || !ID_RE.test(batch.session ?? '') || !ID_RE.test(batch.device ?? '')) {
		return { ok: false, status: 400, reason: 'bad ids' };
	}
	const slideEntries = Object.entries(batch.slides ?? {}).slice(0, 40);
	for (const [id, d] of slideEntries) {
		if (!SLIDE_RE.test(id) || typeof d !== 'object' || d === null) return { ok: false, status: 400, reason: 'bad slide' };
	}
	const slideCount = Math.max(1, Math.min(64, claims.n));

	tx(() => {
		const existing = get<{ user_id: string; year: number }>('SELECT user_id, year FROM view_visits WHERE id = ?', batch.visit);
		if (existing && (existing.user_id !== claims.u || existing.year !== claims.y)) throw new VisitMismatch();
		if (!existing) {
			run(
				`INSERT INTO view_visits (id, user_id, year, mode, session_key, device_key, started_at, last_seen_at, slide_count)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				batch.visit,
				claims.u,
				claims.y,
				claims.m,
				tokenHash(batch.session, 'analytics-session'),
				tokenHash(batch.device, 'analytics-device'),
				now,
				now,
				slideCount
			);
		}
		const furthest = Math.min(int(batch.furthest, 64), slideCount - 1);
		run(
			`UPDATE view_visits SET
				last_seen_at = ?,
				furthest_index = MAX(furthest_index, ?),
				completed = MAX(completed, ?),
				rewatches = rewatches + ?,
				active_ms = active_ms + ?
			 WHERE id = ?`,
			now,
			furthest,
			batch.completed ? 1 : 0,
			int(batch.rewatches, 20),
			int(batch.activeMs, MAX_FLUSH_MS),
			batch.visit
		);
		for (const [slideId, d] of slideEntries) {
			run(
				`INSERT INTO view_slides (visit_id, slide_id, slide_index, enters, dwell_ms, skips, revisits)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(visit_id, slide_id) DO UPDATE SET
					enters = enters + excluded.enters,
					dwell_ms = dwell_ms + excluded.dwell_ms,
					skips = skips + excluded.skips,
					revisits = revisits + excluded.revisits`,
				batch.visit,
				slideId,
				Math.min(int(d.index, 64), slideCount - 1),
				int(d.enters, 50),
				int(d.dwellMs, MAX_FLUSH_MS),
				int(d.skips, 50),
				int(d.revisits, 50)
			);
		}
	});
	return { ok: true };
}

class VisitMismatch extends Error {}

export function safeIngest(batch: EventBatch): IngestResult {
	try {
		return ingest(batch);
	} catch (e) {
		if (e instanceof VisitMismatch) return { ok: false, status: 403, reason: 'visit mismatch' };
		throw e;
	}
}

// ------------------------------------------------------------------ reporting

export interface UserEngagement {
	user_id: string;
	year: number;
	visits: number;
	sessions: number;
	devices: number;
	first_view: number;
	last_view: number;
	completed_visits: number;
	furthest: number;
	slide_count: number;
	rewatches: number;
	active_ms: number;
	link_visits: number;
}

export function engagementByUser(year?: number): UserEngagement[] {
	const where = year ? 'WHERE year = ?' : '';
	const params = year ? [year] : [];
	return all<UserEngagement>(
		`SELECT user_id, year,
			COUNT(*) AS visits,
			COUNT(DISTINCT session_key) AS sessions,
			COUNT(DISTINCT device_key) AS devices,
			MIN(started_at) AS first_view,
			MAX(last_seen_at) AS last_view,
			SUM(completed) AS completed_visits,
			MAX(furthest_index) AS furthest,
			MAX(slide_count) AS slide_count,
			SUM(rewatches) AS rewatches,
			SUM(active_ms) AS active_ms,
			SUM(CASE WHEN mode = 'link' THEN 1 ELSE 0 END) AS link_visits
		 FROM view_visits ${where}
		 GROUP BY user_id, year
		 ORDER BY last_view DESC`,
		...params
	);
}

export interface SlideEngagement {
	slide_id: string;
	slide_index: number;
	visits_reached: number;
	enters: number;
	dwell_ms: number;
	skips: number;
	revisits: number;
	dropped_here: number;
}

/** Aggregate per-slide engagement across all users for a year. */
export function engagementBySlide(year: number): { totalVisits: number; slides: SlideEngagement[] } {
	const totalVisits = get<{ c: number }>('SELECT COUNT(*) AS c FROM view_visits WHERE year = ?', year)?.c ?? 0;
	const slides = all<SlideEngagement>(
		`SELECT s.slide_id,
			MIN(s.slide_index) AS slide_index,
			COUNT(DISTINCT s.visit_id) AS visits_reached,
			SUM(s.enters) AS enters,
			SUM(s.dwell_ms) AS dwell_ms,
			SUM(s.skips) AS skips,
			SUM(s.revisits) AS revisits,
			SUM(CASE WHEN v.completed = 0 AND v.furthest_index = s.slide_index
				AND v.last_seen_at < ? THEN 1 ELSE 0 END) AS dropped_here
		 FROM view_slides s JOIN view_visits v ON v.id = s.visit_id
		 WHERE v.year = ?
		 GROUP BY s.slide_id
		 ORDER BY slide_index`,
		Date.now() - ABANDON_AFTER_MS,
		year
	);
	return { totalVisits, slides };
}

/** A visit with no activity for this long (and not completed) counts as abandoned. */
export const ABANDON_AFTER_MS = 30 * 60_000;

export function userSlideEngagement(userId: string, year: number) {
	return all<{ slide_id: string; slide_index: number; enters: number; dwell_ms: number; skips: number; revisits: number; visits: number }>(
		`SELECT s.slide_id, MIN(s.slide_index) AS slide_index, SUM(s.enters) AS enters, SUM(s.dwell_ms) AS dwell_ms,
			SUM(s.skips) AS skips, SUM(s.revisits) AS revisits, COUNT(DISTINCT s.visit_id) AS visits
		 FROM view_slides s JOIN view_visits v ON v.id = s.visit_id
		 WHERE v.user_id = ? AND v.year = ?
		 GROUP BY s.slide_id ORDER BY slide_index`,
		userId,
		year
	);
}

export function recentVisits(userId: string, year: number, limit = 25) {
	return all<{
		id: string;
		mode: string;
		started_at: number;
		last_seen_at: number;
		furthest_index: number;
		slide_count: number;
		completed: number;
		rewatches: number;
		active_ms: number;
	}>(
		`SELECT id, mode, started_at, last_seen_at, furthest_index, slide_count, completed, rewatches, active_ms
		 FROM view_visits WHERE user_id = ? AND year = ? ORDER BY started_at DESC LIMIT ?`,
		userId,
		year,
		limit
	);
}

export function analyticsYears(): number[] {
	return all<{ year: number }>('SELECT DISTINCT year FROM view_visits ORDER BY year DESC').map((r) => r.year);
}
