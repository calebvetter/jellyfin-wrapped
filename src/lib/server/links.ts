/**
 * Shareable Wrapped links (/w/<code>): a public, read-only view of one user's prepared
 * Wrapped. A link signs nobody in and reaches nothing else: no settings, no other users,
 * no Jellyfin/Jellystat/Seerr. So codes are short, like a URL shortener's:
 *  - 8 characters from a 56-character alphabet without look-alikes (~46 bits), random;
 *  - looked up via a keyed HMAC hash, stored AES-GCM encrypted so admins can copy them;
 *  - failed lookups are rate limited per client, so guessing codes is hopeless;
 *  - one current link per user; regenerating or revoking ends the old ones;
 *  - persistent across restarts and re-preparation.
 * Older 43-character links keep working (see shortenLegacyLinks).
 */
import crypto from 'node:crypto';
import { all, get, run, tx } from './db';
import { decrypt, encrypt, randomId, tokenHash } from './crypto';

export const LINK_PREFIX = '/w/';
/** No 0/O, 1/l/I: easy to read aloud or retype. */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;
const TOKEN_RE = /^(?:[A-Za-z0-9]{8}|[A-Za-z0-9_-]{43})$/; // short codes, plus legacy long tokens

export function linkCode(): string {
	let s = '';
	for (let i = 0; i < LINK_CODE_LENGTH; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
	return s;
}

export interface LinkRow {
	id: string;
	token_hash: string;
	token_enc: string;
	user_id: string;
	created_at: number;
	created_by: string | null;
	revoked_at: number | null;
	last_used_at: number | null;
	use_count: number;
}

export function isWellFormedToken(token: string): boolean {
	return TOKEN_RE.test(token);
}

/** Create (or replace) the share link for a user. Returns the code. */
export function createLink(userId: string, createdBy: string | null): { id: string; token: string } {
	const now = Date.now();
	return tx(() => {
		run('UPDATE links SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now, userId);
		return insertLink(userId, createdBy, now);
	});
}

function insertLink(userId: string, createdBy: string | null, now: number): { id: string; token: string } {
	for (;;) {
		const token = linkCode();
		const hash = tokenHash(token, 'link');
		if (get('SELECT 1 FROM links WHERE token_hash = ?', hash)) continue; // vanishingly rare
		const id = randomId(9);
		run('INSERT INTO links (id, token_hash, token_enc, user_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', id, hash, encrypt(token), userId, now, createdBy);
		return { id, token };
	}
}

/**
 * Links made before short codes: give each such user a short link (the one admins copy
 * from now on) while their long link keeps working, so nothing already sent breaks.
 * Regenerating or revoking ends both. Runs at startup; a no-op once done.
 */
export function shortenLegacyLinks(): number {
	let n = 0;
	for (const row of activeLinks()) {
		if (activeLinkForUser(row.user_id)?.id !== row.id) continue; // already has a newer link
		const token = linkToken(row);
		if (!token || token.length <= LINK_CODE_LENGTH) continue;
		insertLink(row.user_id, row.created_by, Date.now());
		n++;
	}
	return n;
}

export function revokeLink(id: string): boolean {
	return Number(run('UPDATE links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', Date.now(), id).changes) > 0;
}

export function revokeUserLinks(userId: string): number {
	return Number(run('UPDATE links SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', Date.now(), userId).changes);
}

export function activeLinkForUser(userId: string): LinkRow | undefined {
	return get<LinkRow>('SELECT * FROM links WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', userId);
}

export function activeLinks(): LinkRow[] {
	return all<LinkRow>('SELECT * FROM links WHERE revoked_at IS NULL ORDER BY created_at DESC');
}

/** Decrypt the token of an active link (admin "copy" action). */
export function linkToken(row: LinkRow): string | null {
	if (row.revoked_at) return null;
	return decrypt(row.token_enc);
}

/** Resolve a presented token to its user id, or null. Never throws, never logs the token. */
export function resolveLinkToken(token: string): { linkId: string; userId: string } | null {
	if (!isWellFormedToken(token)) return null;
	const row = get<LinkRow>('SELECT * FROM links WHERE token_hash = ?', tokenHash(token, 'link'));
	if (!row || row.revoked_at) return null;
	const now = Date.now();
	// throttle write amplification: update usage at most once a minute
	if (!row.last_used_at || now - row.last_used_at > 60_000) {
		run('UPDATE links SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?', now, row.id);
	}
	return { linkId: row.id, userId: row.user_id };
}

// ----------------------------------------------------------- brute-force throttling

const failures = new Map<string, { count: number; first: number }>();
export const MAX_FAILURES = 20;
export const FAILURE_WINDOW_MS = 10 * 60_000;

export function isThrottled(clientKey: string, now = Date.now()): boolean {
	const f = failures.get(clientKey);
	if (!f) return false;
	if (now - f.first > FAILURE_WINDOW_MS) {
		failures.delete(clientKey);
		return false;
	}
	return f.count >= MAX_FAILURES;
}

export function recordFailure(clientKey: string, now = Date.now()) {
	const f = failures.get(clientKey);
	if (!f || now - f.first > FAILURE_WINDOW_MS) failures.set(clientKey, { count: 1, first: now });
	else f.count++;
	if (failures.size > 50_000) failures.clear();
}

export function _resetThrottleForTests() {
	failures.clear();
}
