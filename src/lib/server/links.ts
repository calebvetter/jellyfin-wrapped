/**
 * Passwordless personal Wrapped links. Tokens are 256-bit random bearer credentials:
 *  - looked up via a keyed HMAC hash (constant-length, no plaintext lookups);
 *  - stored AES-GCM encrypted so admins can copy them again later;
 *  - one active link per user; regenerating revokes the old one;
 *  - persistent across restarts and data re-preparation (only revocation ends them);
 *  - failed lookups are rate limited per client to make enumeration pointless.
 * A link grants access to exactly one user's prepared report and nothing else.
 */
import { all, get, run, tx } from './db';
import { decrypt, encrypt, randomId, randomToken, tokenHash } from './crypto';

export const LINK_PREFIX = '/w/';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

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

/** Create (or regenerate) the personal link for a user. Returns the raw token. */
export function createLink(userId: string, createdBy: string | null): { id: string; token: string } {
	const token = randomToken(32);
	const id = randomId(9);
	const now = Date.now();
	tx(() => {
		run('UPDATE links SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now, userId);
		run(
			'INSERT INTO links (id, token_hash, token_enc, user_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
			id,
			tokenHash(token, 'link'),
			encrypt(token),
			userId,
			now,
			createdBy
		);
	});
	return { id, token };
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
