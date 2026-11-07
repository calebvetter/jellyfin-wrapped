/**
 * Server-side sessions for Jellyfin-authenticated users.
 * The cookie holds a random 256-bit id; only its keyed hash is stored. Permissions
 * (admin, disabled) are re-verified against Jellyfin with the server API key at most
 * every REVERIFY_MS, so revoking admin rights in Jellyfin takes effect quickly.
 */
import { get, run } from '../db';
import { randomToken, tokenHash } from '../crypto';
import { config } from '../config';
import * as jf from '../integrations/jellyfin';
import { normId } from '../prep/requests';

export const SESSION_COOKIE = 'jw_session';
export const REVERIFY_MS = 5 * 60_000;
/** If Jellyfin is unreachable, cached permissions are trusted for at most this long. */
export const OFFLINE_GRACE_MS = 60 * 60_000;

export interface SessionUser {
	id: string;
	name: string;
	isAdmin: boolean;
}

interface SessionRow {
	id_hash: string;
	user_id: string;
	user_name: string;
	is_admin: number;
	created_at: number;
	expires_at: number;
	verified_at: number;
}

export function createSession(user: { Id: string; Name: string; Policy?: { IsAdministrator?: boolean } }): { cookie: string; expires: Date } {
	const cookie = randomToken(32);
	const now = Date.now();
	const expires = now + config().sessionTtlHours * 3_600_000;
	run(
		'INSERT INTO sessions (id_hash, user_id, user_name, is_admin, created_at, expires_at, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		tokenHash(cookie, 'session'),
		normId(user.Id),
		user.Name,
		user.Policy?.IsAdministrator ? 1 : 0,
		now,
		expires,
		now
	);
	// opportunistic cleanup
	run('DELETE FROM sessions WHERE expires_at < ?', now);
	return { cookie, expires: new Date(expires) };
}

export function destroySession(cookie: string | undefined) {
	if (!cookie) return;
	run('DELETE FROM sessions WHERE id_hash = ?', tokenHash(cookie, 'session'));
}

export type UserLookup = (userId: string) => Promise<jf.JellyfinUser | null>;

/** Resolve a session cookie to a user, re-verifying permissions with Jellyfin when stale. */
export async function resolveSession(cookie: string | undefined, lookup: UserLookup = jf.getUser, now = Date.now()): Promise<SessionUser | null> {
	if (!cookie || cookie.length > 100) return null;
	const hash = tokenHash(cookie, 'session');
	const row = get<SessionRow>('SELECT * FROM sessions WHERE id_hash = ?', hash);
	if (!row) return null;
	if (row.expires_at < now) {
		run('DELETE FROM sessions WHERE id_hash = ?', hash);
		return null;
	}
	if (now - row.verified_at > REVERIFY_MS) {
		let user: jf.JellyfinUser | null | undefined;
		try {
			user = await lookup(row.user_id);
		} catch {
			user = undefined; // Jellyfin unreachable
		}
		if (user === undefined) {
			if (now - row.verified_at > OFFLINE_GRACE_MS) return null;
		} else if (!user || user.Policy?.IsDisabled) {
			run('DELETE FROM sessions WHERE id_hash = ?', hash);
			return null;
		} else {
			row.is_admin = user.Policy?.IsAdministrator ? 1 : 0;
			row.user_name = user.Name;
			run('UPDATE sessions SET is_admin = ?, user_name = ?, verified_at = ? WHERE id_hash = ?', row.is_admin, row.user_name, now, hash);
		}
	}
	return { id: row.user_id, name: row.user_name, isAdmin: row.is_admin === 1 };
}

export function cookieOptions(url: URL, expires?: Date) {
	const secureSetting = config().cookieSecure;
	const secure = secureSetting === 'auto' ? url.protocol === 'https:' : secureSetting;
	return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure, ...(expires ? { expires } : {}) };
}
