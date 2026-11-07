/**
 * Jellyfin client (10.11 and 12.x). Uses only the modern `Authorization: MediaBrowser ...`
 * header — legacy X-Emby-* auth is disabled by default from 12.0.
 */
import { config } from '../config';
import { randomId } from '../crypto';
import { requestJson, UpstreamError } from './http';

const CLIENT = 'Jellyfin Wrapped';
const VERSION = '1.0.0';
const SERVER_DEVICE_ID = 'jellyfin-wrapped-server';

function authHeader(token?: string, deviceId = SERVER_DEVICE_ID): string {
	const parts = [
		`Client="${encodeURIComponent(CLIENT)}"`,
		`Device="${encodeURIComponent('Wrapped Server')}"`,
		`DeviceId="${encodeURIComponent(deviceId)}"`,
		`Version="${VERSION}"`
	];
	if (token) parts.push(`Token="${encodeURIComponent(token)}"`);
	return `MediaBrowser ${parts.join(', ')}`;
}

const base = () => config().jellyfin.url;
const apiHeaders = () => ({ Authorization: authHeader(config().jellyfin.apiKey) });

export interface JellyfinPolicy {
	IsAdministrator: boolean;
	IsDisabled: boolean;
	IsHidden?: boolean;
}

export interface JellyfinUser {
	Id: string;
	Name: string;
	PrimaryImageTag?: string | null;
	LastActivityDate?: string | null;
	Policy?: JellyfinPolicy;
}

export interface JellyfinPerson {
	Id?: string;
	Name: string;
	Role?: string | null;
	Type?: string;
	PrimaryImageTag?: string | null;
}

export interface JellyfinItem {
	Id: string;
	Name: string;
	Type: string;
	ProductionYear?: number | null;
	PremiereDate?: string | null;
	RunTimeTicks?: number | null;
	IndexNumber?: number | null;
	ParentIndexNumber?: number | null;
	SeriesId?: string | null;
	SeriesName?: string | null;
	SeasonId?: string | null;
	Genres?: string[];
	People?: JellyfinPerson[];
	ProviderIds?: Record<string, string>;
	ImageTags?: Record<string, string>;
	BackdropImageTags?: string[];
	ChildCount?: number | null;
}

export class InvalidCredentialsError extends Error {}

/**
 * Authenticate a user by username/password. The resulting Jellyfin access token is used
 * only to read the user's identity and is immediately logged out again — Wrapped keeps
 * its own session and re-checks permissions with the server API key.
 */
export async function authenticateUser(username: string, password: string): Promise<JellyfinUser> {
	const deviceId = `wrapped-${randomId(12)}`;
	let res: { User: JellyfinUser; AccessToken: string } | null;
	try {
		res = await requestJson<{ User: JellyfinUser; AccessToken: string }>('Jellyfin', `${base()}/Users/AuthenticateByName`, {
			method: 'POST',
			headers: { Authorization: authHeader(undefined, deviceId) },
			body: { Username: username, Pw: password },
			retries: 0,
			timeoutMs: 15_000
		});
	} catch (e) {
		if (e instanceof UpstreamError && (e.status === 401 || e.status === 403 || e.status === 400)) {
			// Jellyfin answers bad credentials with 401 and disabled/remote-blocked users with 401/403
			throw new InvalidCredentialsError('Invalid username or password');
		}
		throw e;
	}
	if (!res?.User?.Id || !res.AccessToken) throw new InvalidCredentialsError('Invalid username or password');
	// Best effort: end the Jellyfin session we just created.
	requestJson('Jellyfin', `${base()}/Sessions/Logout`, {
		method: 'POST',
		headers: { Authorization: authHeader(res.AccessToken, deviceId) },
		retries: 0,
		timeoutMs: 5000
	}).catch(() => {});
	return res.User;
}

/** Fetch a user with the server API key (authoritative permission source). */
export async function getUser(userId: string): Promise<JellyfinUser | null> {
	return requestJson<JellyfinUser>('Jellyfin', `${base()}/Users/${encodeURIComponent(userId)}`, {
		headers: apiHeaders(),
		allow404: true,
		retries: 1,
		timeoutMs: 10_000
	});
}

export async function listUsers(): Promise<JellyfinUser[]> {
	return (await requestJson<JellyfinUser[]>('Jellyfin', `${base()}/Users`, { headers: apiHeaders() })) ?? [];
}

export async function ping(): Promise<{ ok: boolean; version?: string; name?: string }> {
	const r = await requestJson<{ Version?: string; ServerName?: string }>('Jellyfin', `${base()}/System/Info`, {
		headers: apiHeaders(),
		retries: 0,
		timeoutMs: 8000
	});
	return { ok: Boolean(r), version: r?.Version, name: r?.ServerName };
}

const ITEM_FIELDS = ['Genres', 'People', 'ProviderIds', 'ChildCount', 'PremiereDate'].join(',');

/** Bulk-fetch items by id (API key; no per-user filtering). Missing ids are simply absent. */
export async function getItems(ids: string[]): Promise<JellyfinItem[]> {
	const out: JellyfinItem[] = [];
	for (let i = 0; i < ids.length; i += 100) {
		const chunk = ids.slice(i, i + 100);
		const qs = `ids=${chunk.map(encodeURIComponent).join(',')}&fields=${ITEM_FIELDS}&enableImages=true&enableUserData=false`;
		const r = await requestJson<{ Items: JellyfinItem[] }>('Jellyfin', `${base()}/Items?${qs}`, { headers: apiHeaders(), timeoutMs: 60_000 });
		out.push(...(r?.Items ?? []));
	}
	return out;
}

/** Theme songs attached to an item (theme.mp3 / theme-music folders / Theme Songs plugin). */
export async function getThemeSongs(itemId: string): Promise<JellyfinItem[]> {
	const r = await requestJson<{ Items?: JellyfinItem[] }>(
		'Jellyfin',
		`${base()}/Items/${encodeURIComponent(itemId)}/ThemeSongs?inheritFromParent=true`,
		{ headers: apiHeaders(), allow404: true, retries: 1, timeoutMs: 15_000 }
	);
	return r?.Items ?? [];
}

/** Download an audio item's original file (used to cache theme songs locally). */
export async function downloadAudio(itemId: string, maxBytes = 40 * 1024 * 1024): Promise<{ bytes: Buffer; mime: string } | null> {
	try {
		const res = await fetch(`${base()}/Audio/${encodeURIComponent(itemId)}/stream?static=true`, {
			headers: apiHeaders(),
			signal: AbortSignal.timeout(60_000)
		});
		if (!res.ok) return null;
		const mime = (res.headers.get('content-type') ?? 'audio/mpeg').split(';')[0].trim();
		if (!mime.startsWith('audio/')) return null;
		const bytes = Buffer.from(await res.arrayBuffer());
		return bytes.length && bytes.length <= maxBytes ? { bytes, mime } : null;
	} catch {
		return null;
	}
}

/** Episodes of a series (to learn per-season episode counts). */
export async function getSeriesEpisodes(seriesId: string): Promise<JellyfinItem[]> {
	const r = await requestJson<{ Items: JellyfinItem[] }>(
		'Jellyfin',
		`${base()}/Shows/${encodeURIComponent(seriesId)}/Episodes?fields=PremiereDate&enableImages=false&enableUserData=false`,
		{ headers: apiHeaders(), allow404: true, timeoutMs: 30_000 }
	);
	return r?.Items ?? [];
}

/** Image URL (anonymous endpoint). */
export function imageUrl(itemId: string, kind: 'Primary' | 'Backdrop', tag?: string | null, maxWidth = 600): string {
	const qs = new URLSearchParams({ maxWidth: String(maxWidth), quality: '90' });
	if (tag) qs.set('tag', tag);
	return `${base()}/Items/${encodeURIComponent(itemId)}/Images/${kind}?${qs}`;
}

/** Headers to use when downloading Jellyfin images server-side. */
export function imageHeaders(): Record<string, string> {
	return apiHeaders();
}

export function ticksToSeconds(ticks?: number | null): number | null {
	return ticks && ticks > 0 ? Math.round(ticks / 10_000_000) : null;
}
