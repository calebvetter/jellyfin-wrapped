/** Admin-side helpers: service health checks, user sync, link views. */
import { all, run, tx } from './db';
import { config, configProblems, seerrEnabled } from './config';
import * as jf from './integrations/jellyfin';
import * as js from './integrations/jellystat';
import * as seerr from './integrations/seerr';
import { normId } from './prep/requests';
import { activeLinkForUser, linkToken, type LinkRow } from './links';

export interface ServiceStatus {
	name: string;
	configured: boolean;
	ok: boolean;
	detail: string;
}

export async function checkServices(): Promise<ServiceStatus[]> {
	const c = config();
	const wrap = async (name: string, configured: boolean, fn: () => Promise<string>): Promise<ServiceStatus> => {
		if (!configured) return { name, configured, ok: false, detail: 'Not configured' };
		try {
			return { name, configured, ok: true, detail: await fn() };
		} catch (e) {
			return { name, configured, ok: false, detail: (e as Error).message };
		}
	};
	return Promise.all([
		wrap('Jellyfin', Boolean(c.jellyfin.url && c.jellyfin.apiKey), async () => {
			const r = await jf.ping();
			return `${r.name ?? 'Server'} ${r.version ? `v${r.version}` : ''}`.trim();
		}),
		wrap('Jellystat', Boolean(c.jellystat.url && c.jellystat.apiKey), async () => ((await js.ping()) ? 'Playback history reachable' : 'Unexpected response')),
		wrap('Seerr', seerrEnabled(), async () => ((await seerr.ping()) ? 'Requests & TMDb metadata reachable' : 'Unexpected response'))
	]);
}

export function problems() {
	return configProblems();
}

export async function syncUsers(): Promise<number> {
	const users = await jf.listUsers();
	const now = Date.now();
	tx(() => {
		for (const u of users) {
			run(
				`INSERT INTO users (id, name, is_admin, is_disabled, image_tag, last_activity, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_admin=excluded.is_admin, is_disabled=excluded.is_disabled,
				 image_tag=excluded.image_tag, last_activity=excluded.last_activity, synced_at=excluded.synced_at`,
				normId(u.Id),
				u.Name,
				u.Policy?.IsAdministrator ? 1 : 0,
				u.Policy?.IsDisabled ? 1 : 0,
				u.PrimaryImageTag ?? null,
				u.LastActivityDate ?? null,
				now
			);
		}
	});
	return users.length;
}

export interface UserRow {
	id: string;
	name: string;
	is_admin: number;
	is_disabled: number;
	last_activity: string | null;
	synced_at: number;
	/** 1 = gets a Wrapped when the admin prepares a year (checkbox on the Users page). */
	included: number;
	/** Preparation timezone; null = the admin's default. */
	timezone: string | null;
}

export function listUserRows(): UserRow[] {
	return all<UserRow>('SELECT id, name, is_admin, is_disabled, last_activity, synced_at, included, timezone FROM users ORDER BY name COLLATE NOCASE');
}

/** Choose which users get a Wrapped on the next preparation. */
export function setIncluded(ids: string[], included: boolean): number {
	let n = 0;
	tx(() => {
		for (const id of ids) n += Number(run('UPDATE users SET included = ? WHERE id = ?', included ? 1 : 0, id).changes);
	});
	return n;
}

export function linkView(row: LinkRow | undefined, origin: string) {
	if (!row) return null;
	const token = linkToken(row);
	return {
		id: row.id,
		url: token ? `${origin}/w/${token}` : null,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		useCount: row.use_count,
		createdBy: row.created_by
	};
}

export function userLink(userId: string, origin: string) {
	return linkView(activeLinkForUser(userId), origin);
}
