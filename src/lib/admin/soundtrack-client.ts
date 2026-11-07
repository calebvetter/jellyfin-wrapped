/** Admin-side soundtrack API helpers (browser only). */

export async function patchAudio(id: string, patch: Record<string, unknown>) {
	const res = await fetch(`/api/admin/soundtrack/audio/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
	if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Update failed');
}

export async function titleAction<T = Record<string, unknown>>(key: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
	const res = await fetch('/api/admin/soundtrack/title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, action, ...extra }) });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error ?? 'Request failed');
	return body as T;
}

export async function selectTopTracks(): Promise<{ selected: number; failed: number }> {
	const res = await fetch('/api/admin/soundtrack/bulk', { method: 'POST' });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error ?? 'Request failed');
	return body;
}

export function fmtTime(sec: number | null | undefined): string {
	if (sec == null || !Number.isFinite(sec)) return '—';
	const s = Math.max(0, Math.round(sec));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Grab audio from a YouTube link for a title (server runs yt-dlp; can take a minute). */
export async function grabYouTube(key: string, url: string): Promise<{ id: string; title: string; duration: number | null }> {
	const res = await fetch('/api/admin/soundtrack/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, url }) });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error ?? 'Download failed');
	return body;
}
