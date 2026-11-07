import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, _setDbForTests, get } from '../src/lib/server/db';
import { _setSecretForTests, decrypt, encrypt, randomToken, sign, tokenHash, verify } from '../src/lib/server/crypto';
import {
	createLink,
	isThrottled,
	recordFailure,
	resolveLinkToken,
	revokeLink,
	activeLinkForUser,
	linkToken,
	MAX_FAILURES,
	_resetThrottleForTests
} from '../src/lib/server/links';
import { accessPolicy, canViewUser, redactPath, safeNext } from '../src/lib/server/auth/guard';
import { createSession, resolveSession, REVERIFY_MS, OFFLINE_GRACE_MS } from '../src/lib/server/auth/session';

beforeEach(() => {
	_setSecretForTests('test-secret-for-unit-tests-0123456789');
	_setDbForTests(openDatabase(':memory:'));
	_resetThrottleForTests();
});

describe('crypto primitives', () => {
	it('generates 256-bit url-safe tokens', () => {
		const t = randomToken();
		expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken()).not.toBe(t);
	});

	it('separates hash purposes', () => {
		expect(tokenHash('abc', 'link')).toBe(tokenHash('abc', 'link'));
		expect(tokenHash('abc', 'link')).not.toBe(tokenHash('abc', 'session'));
	});

	it('round-trips authenticated encryption and rejects tampering', () => {
		const enc = encrypt('hello');
		expect(decrypt(enc)).toBe('hello');
		const parts = enc.split('.');
		parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'BB' : 'AA');
		expect(decrypt(parts.join('.'))).toBeNull();
	});

	it('signs and verifies, rejecting forged or cross-purpose tokens', () => {
		const t = sign({ u: 'x' }, 'track');
		expect(verify<{ u: string }>(t, 'track')?.u).toBe('x');
		expect(verify(t, 'other')).toBeNull();
		const [body] = t.split('.');
		const forgedBody = Buffer.from(JSON.stringify({ u: 'admin' })).toString('base64url');
		expect(verify(`${forgedBody}.${t.split('.')[1]}`, 'track')).toBeNull();
		expect(verify(`${body}.`, 'track')).toBeNull();
	});
});

describe('personal links', () => {
	it('resolves only to the linked user', () => {
		const { token } = createLink('user-a', 'admin');
		expect(resolveLinkToken(token)?.userId).toBe('user-a');
	});

	it('stores only a hash and an encrypted copy of the token', () => {
		const { token } = createLink('user-a', 'admin');
		const row = get<{ token_hash: string; token_enc: string }>('SELECT token_hash, token_enc FROM links');
		expect(row!.token_hash).not.toContain(token);
		expect(row!.token_enc).not.toContain(token);
		expect(linkToken(activeLinkForUser('user-a')!)).toBe(token);
	});

	it('regenerating revokes the previous link', () => {
		const first = createLink('user-a', 'admin');
		const second = createLink('user-a', 'admin');
		expect(resolveLinkToken(first.token)).toBeNull();
		expect(resolveLinkToken(second.token)?.userId).toBe('user-a');
	});

	it('revocation is immediate', () => {
		const { id, token } = createLink('user-a', 'admin');
		expect(revokeLink(id)).toBe(true);
		expect(resolveLinkToken(token)).toBeNull();
		expect(revokeLink(id)).toBe(false);
	});

	it('rejects malformed and unknown tokens without lookups leaking', () => {
		expect(resolveLinkToken('')).toBeNull();
		expect(resolveLinkToken('../../etc/passwd')).toBeNull();
		expect(resolveLinkToken('A'.repeat(43))).toBeNull();
		expect(resolveLinkToken('A'.repeat(44))).toBeNull();
	});

	it('throttles clients after repeated failures', () => {
		for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('ip1');
		expect(isThrottled('ip1')).toBe(false);
		recordFailure('ip1');
		expect(isThrottled('ip1')).toBe(true);
		expect(isThrottled('ip2')).toBe(false);
		expect(isThrottled('ip1', Date.now() + 11 * 60_000)).toBe(false);
	});
});

describe('access control', () => {
	it('classifies routes', () => {
		expect(accessPolicy('/admin')).toBe('admin');
		expect(accessPolicy('/admin/users/x')).toBe('admin');
		expect(accessPolicy('/api/admin/prep')).toBe('admin');
		expect(accessPolicy('/administrator')).toBe('public');
		expect(accessPolicy('/wrapped')).toBe('user');
		expect(accessPolicy('/w/token')).toBe('link');
		expect(accessPolicy('/art/abc')).toBe('public-asset');
		expect(accessPolicy('/api/events')).toBe('public');
	});

	it('redacts bearer tokens from logged paths', () => {
		expect(redactPath('/w/abcDEF123_-xyz')).toBe('/w/[redacted]');
		expect(redactPath('/w/abc/__data.json')).toBe('/w/[redacted]/__data.json');
		expect(redactPath('/admin/users')).toBe('/admin/users');
	});

	it('prevents open redirects and privilege confusion after login', () => {
		expect(safeNext('https://evil.example', false)).toBe('/wrapped');
		expect(safeNext('//evil.example', true)).toBe('/admin');
		expect(safeNext('/\\evil.example', true)).toBe('/admin');
		expect(safeNext('/admin/links', false)).toBe('/wrapped');
		expect(safeNext('/admin/links', true)).toBe('/admin/links');
		expect(safeNext('/wrapped?year=2025', false)).toBe('/wrapped?year=2025');
	});

	it('only lets users view themselves; admins can view anyone', () => {
		expect(canViewUser({ id: 'a', isAdmin: false }, 'a')).toBe(true);
		expect(canViewUser({ id: 'a', isAdmin: false }, 'b')).toBe(false);
		expect(canViewUser({ id: 'a', isAdmin: true }, 'b')).toBe(true);
		expect(canViewUser(null, 'a')).toBe(false);
	});
});

describe('sessions', () => {
	const jfUser = (admin: boolean, disabled = false) => ({ Id: 'ABC-123', Name: 'Ann', Policy: { IsAdministrator: admin, IsDisabled: disabled } });

	it('creates sessions keyed by a hash and normalizes user ids', async () => {
		const { cookie } = createSession(jfUser(true));
		const u = await resolveSession(cookie, async () => null);
		expect(u).toEqual({ id: 'abc123', name: 'Ann', isAdmin: true });
		expect(get('SELECT * FROM sessions WHERE id_hash = ?', cookie)).toBeUndefined();
	});

	it('re-verifies permissions with Jellyfin and demotes revoked admins', async () => {
		const { cookie } = createSession(jfUser(true));
		const later = Date.now() + REVERIFY_MS + 1000;
		const u = await resolveSession(cookie, async () => ({ Id: 'abc123', Name: 'Ann', Policy: { IsAdministrator: false, IsDisabled: false } }), later);
		expect(u?.isAdmin).toBe(false);
	});

	it('ends sessions of disabled or deleted users', async () => {
		const a = createSession(jfUser(false)).cookie;
		const later = Date.now() + REVERIFY_MS + 1000;
		expect(await resolveSession(a, async () => ({ Id: 'abc123', Name: 'Ann', Policy: { IsAdministrator: false, IsDisabled: true } }), later)).toBeNull();
		const b = createSession(jfUser(false)).cookie;
		expect(await resolveSession(b, async () => null, later)).toBeNull();
		expect(await resolveSession(b, async () => null)).toBeNull(); // row deleted
	});

	it('tolerates short Jellyfin outages but fails closed after the grace period', async () => {
		const { cookie } = createSession(jfUser(true));
		const down = async () => {
			throw new Error('ECONNREFUSED');
		};
		expect((await resolveSession(cookie, down, Date.now() + REVERIFY_MS + 1000))?.isAdmin).toBe(true);
		expect(await resolveSession(cookie, down, Date.now() + OFFLINE_GRACE_MS + 1000)).toBeNull();
	});

	it('rejects unknown cookies', async () => {
		expect(await resolveSession('nope', async () => null)).toBeNull();
		expect(await resolveSession(undefined, async () => null)).toBeNull();
	});
});
