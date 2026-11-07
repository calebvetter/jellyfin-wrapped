import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, _setDbForTests, run } from '../src/lib/server/db';
import { _setSecretForTests } from '../src/lib/server/crypto';
import { engagementBySlide, engagementByUser, ingest, issueTrackingToken, safeIngest, verifyTrackingToken, ABANDON_AFTER_MS } from '../src/lib/server/analytics';
import { requestStats, type NormalizedRequest } from '../src/lib/server/prep/requests';
import type { View } from '../src/lib/server/prep/model';

beforeEach(() => {
	_setSecretForTests('test-secret-for-unit-tests-0123456789');
	_setDbForTests(openDatabase(':memory:'));
});

const ids = { visit: 'visit-0000001', session: 'session-00001', device: 'device-000001' };

describe('engagement tracking', () => {
	it('issues scoped, expiring tracking tokens', () => {
		const t = issueTrackingToken('u1', 2026, 'link', 15);
		expect(verifyTrackingToken(t)).toMatchObject({ u: 'u1', y: 2026, m: 'link', n: 15 });
		expect(verifyTrackingToken(t + 'x')).toBeNull();
	});

	it('rejects batches without a valid token (e.g. admin previews get none)', () => {
		expect(ingest({ t: '', ...ids })).toMatchObject({ ok: false, status: 401 });
	});

	it('accumulates deltas per visit and slide', () => {
		const t = issueTrackingToken('u1', 2026, 'login', 15);
		ingest({ t, ...ids, slides: { intro: { index: 0, enters: 1, dwellMs: 5000 } }, furthest: 0, activeMs: 5000 });
		ingest({ t, ...ids, slides: { intro: { index: 0, dwellMs: 1000 }, 'total-time': { index: 1, enters: 1, dwellMs: 2000, skips: 1 } }, furthest: 1, activeMs: 3000 });
		ingest({ t, ...ids, slides: { intro: { index: 0, enters: 1, revisits: 1 } }, furthest: 1, completed: false });
		const [u] = engagementByUser(2026);
		expect(u).toMatchObject({ user_id: 'u1', visits: 1, sessions: 1, furthest: 1, active_ms: 8000, completed_visits: 0 });
		const slides = engagementBySlide(2026).slides;
		expect(slides.find((s) => s.slide_id === 'intro')).toMatchObject({ enters: 2, dwell_ms: 6000, revisits: 1 });
		expect(slides.find((s) => s.slide_id === 'total-time')).toMatchObject({ skips: 1 });
	});

	it('distinguishes unique sessions from repeat visits', () => {
		const t = issueTrackingToken('u1', 2026, 'login', 15);
		ingest({ t, visit: 'visit-aaaaaaa1', session: 'sess-aaaaaaaa', device: 'dev-aaaaaaaa' });
		ingest({ t, visit: 'visit-aaaaaaa2', session: 'sess-aaaaaaaa', device: 'dev-aaaaaaaa' }); // reload, same tab
		ingest({ t, visit: 'visit-aaaaaaa3', session: 'sess-bbbbbbbb', device: 'dev-aaaaaaaa' }); // new session
		expect(engagementByUser(2026)[0]).toMatchObject({ visits: 3, sessions: 2, devices: 1 });
	});

	it('refuses to attach events to another user’s visit', () => {
		const a = issueTrackingToken('u1', 2026, 'login', 15);
		const b = issueTrackingToken('u2', 2026, 'link', 15);
		expect(ingest({ t: a, ...ids }).ok).toBe(true);
		expect(safeIngest({ t: b, ...ids })).toMatchObject({ ok: false, status: 403 });
	});

	it('clamps hostile values', () => {
		const t = issueTrackingToken('u1', 2026, 'login', 5);
		ingest({ t, ...ids, furthest: 999, activeMs: 1e12, rewatches: -4, slides: { intro: { index: 99, dwellMs: 1e12, enters: 1e6 } } });
		const [u] = engagementByUser(2026);
		expect(u.furthest).toBe(4);
		expect(u.active_ms).toBeLessThanOrEqual(15 * 60_000);
		expect(u.rewatches).toBe(0);
		expect(ingest({ t, ...ids, slides: { 'bad slide!': { index: 0 } } })).toMatchObject({ ok: false, status: 400 });
	});

	it('counts drop-offs only for abandoned, incomplete visits', () => {
		const t = issueTrackingToken('u1', 2026, 'login', 15);
		ingest({ t, ...ids, slides: { genres: { index: 4, enters: 1 } }, furthest: 4 });
		expect(engagementBySlide(2026).slides[0].dropped_here).toBe(0); // still active
		run('UPDATE view_visits SET last_seen_at = ?', Date.now() - ABANDON_AFTER_MS - 1000);
		expect(engagementBySlide(2026).slides[0].dropped_here).toBe(1);
	});
});

describe('good taste', () => {
	const T = Date.UTC(2026, 3, 1);
	const range = { rangeStart: Date.UTC(2026, 0, 1), rangeEnd: Date.UTC(2027, 0, 1) };
	const view = (userId: string, titleKey: string, start: number): View => ({
		userId,
		kind: 'movie',
		unitKey: titleKey,
		titleKey,
		season: null,
		episode: null,
		start,
		end: start + 3600_000,
		seconds: 3600,
		segments: [],
		runtimeSec: 3600,
		completed: true,
		rewatch: false
	});
	const req = (userId: string, tmdbId: number, createdAt: number, status = 2): NormalizedRequest => ({ userId, createdAt, mediaType: 'movie', tmdbId, jellyfinMediaId: null, status });
	const keysFor = (r: NormalizedRequest) => [`movie:tmdb:${r.tmdbId}`];

	it('counts distinct requested titles later watched by other users only', () => {
		const requests = [req('me', 1, T), req('me', 1, T + 1000), req('me', 2, T), req('me', 3, T), req('me', 4, T, 3), req('other', 5, T)];
		const views = [
			view('me', 'movie:tmdb:1', T + 86400_000), // my own viewing doesn't count
			view('u2', 'movie:tmdb:2', T + 86400_000), // counts
			view('u3', 'movie:tmdb:2', T + 86400_000), // same title, second viewer
			view('u2', 'movie:tmdb:3', T - 86400_000), // watched BEFORE the request: doesn't count
			view('u2', 'movie:tmdb:4', T + 86400_000) // declined request: excluded
		];
		const s = requestStats('me', requests, views, range, keysFor);
		expect(s.total).toBe(3); // titles 1,2,3 (duplicate request merged, declined excluded)
		expect(s.goodTaste.map((g) => g.tmdbId)).toEqual([2]);
		expect(s.goodTasteViewers).toBe(2);
	});
});
