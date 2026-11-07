export function fmtDate(ts: number | null | undefined, withTime = true): string {
	if (!ts) return '—';
	const d = new Date(ts);
	return d.toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function fmtDuration(ms: number | null | undefined): string {
	if (!ms || ms < 1000) return '0s';
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtMinutes(min: number | null | undefined): string {
	if (!min) return '0h';
	const h = Math.floor(min / 60);
	return h ? `${h.toLocaleString()}h ${min % 60}m` : `${min}m`;
}

export function pct(x: number | null | undefined): string {
	return x == null || !Number.isFinite(x) ? '—' : `${Math.round(x * 100)}%`;
}

export function ago(ts: number | null | undefined): string {
	if (!ts) return 'never';
	const s = Math.round((Date.now() - ts) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	return `${Math.round(s / 86400)}d ago`;
}
