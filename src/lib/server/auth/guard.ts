/**
 * Route access policy, kept as pure functions so they can be unit tested.
 *  - admin:        /admin/**, /api/admin/**        (Jellyfin administrators only)
 *  - user:         /wrapped                         (any signed-in Jellyfin user)
 *  - link:         /w/<token>                       (bearer token; no session needed)
 *  - public-asset: /art/**, /audio/**, /_app/**      (non-sensitive, cacheable media)
 *  - public:       everything else (login page, health, events endpoint)
 */
export type AccessPolicy = 'admin' | 'user' | 'link' | 'public-asset' | 'public';

export function accessPolicy(path: string): AccessPolicy {
	if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/')) return 'admin';
	if (path === '/wrapped' || path.startsWith('/wrapped/')) return 'user';
	if (path.startsWith('/w/')) return 'link';
	if (path.startsWith('/art/') || path.startsWith('/audio/') || path.startsWith('/_app/') || path === '/favicon.svg' || path === '/robots.txt') return 'public-asset';
	return 'public';
}

/** Remove bearer tokens from paths before they reach any log line. */
export function redactPath(path: string): string {
	return path.replace(/^\/w\/[^/?#]+/, '/w/[redacted]');
}

/** Who may view which user's Wrapped. */
export function canViewUser(viewer: { id: string; isAdmin: boolean } | null, targetUserId: string): boolean {
	if (!viewer) return false;
	return viewer.isAdmin || viewer.id === targetUserId;
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNext(next: string | null, isAdmin: boolean): string {
	if (next && /^\/(?![/\\])/.test(next) && !/[\r\n]/.test(next)) {
		if ((next === '/admin' || next.startsWith('/admin/')) && !isAdmin) return '/wrapped';
		if (next.startsWith('/w/')) return isAdmin ? '/admin' : '/wrapped';
		return next;
	}
	return isAdmin ? '/admin' : '/wrapped';
}
