import type { Handle, HandleServerError } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth/session';
import { getDb } from '$lib/server/db';
import { recoverInterruptedRuns } from '$lib/server/prep/runner';
import { cleanupOrphanAudio } from '$lib/server/soundtrack';
import { shortenLegacyLinks } from '$lib/server/links';
import { randomId } from '$lib/server/crypto';
import { redactPath, accessPolicy } from '$lib/server/auth/guard';
import { config, configProblems } from '$lib/server/config';

if (!building) {
	getDb();
	recoverInterruptedRuns();
	cleanupOrphanAudio();
	try {
		const n = shortenLegacyLinks();
		if (n) console.log(`[startup] gave ${n} users a short link (their old links still work)`);
	} catch (e) {
		console.warn(`[startup] couldn't shorten old links: ${(e as Error).message}`);
	}
	const problems = configProblems();
	if (problems.length) console.warn(`[config] ${problems.join(' | ')}`);
	console.log(`[startup] data dir ${config().dataDir}, mock preview ${config().mockPreview ? 'on' : 'off'}`);
}

const SECURITY_HEADERS: Record<string, string> = {
	'Referrer-Policy': 'no-referrer',
	'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomId(6);
	const path = event.url.pathname;
	const started = Date.now();

	const policy = accessPolicy(path);

	// Session (skip for static-ish public assets)
	event.locals.user = policy === 'public-asset' ? null : await resolveSession(event.cookies.get(SESSION_COOKIE));

	// Same-origin enforcement for state-changing JSON APIs (form actions are checked by SvelteKit)
	if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
		const origin = event.request.headers.get('origin');
		if (origin && origin !== event.url.origin) return json({ error: 'Cross-origin request rejected' }, { status: 403 });
		if (!origin && path.startsWith('/api/admin/')) return json({ error: 'Missing Origin header' }, { status: 403 });
	}

	if (policy === 'admin') {
		if (!event.locals.user) {
			if (path.startsWith('/api/')) return json({ error: 'Not signed in' }, { status: 401 });
			redirect(303, `/?next=${encodeURIComponent(path)}`);
		}
		if (!event.locals.user.isAdmin) {
			if (path.startsWith('/api/')) return json({ error: 'Administrator access required' }, { status: 403 });
			redirect(303, '/wrapped');
		}
	}

	const response = await resolve(event);

	for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!response.headers.has(k)) response.headers.set(k, v);
	if (policy !== 'public-asset' && !response.headers.has('Cache-Control')) {
		response.headers.set('Cache-Control', 'private, no-store');
	}

	if (path !== '/api/health' && policy !== 'public-asset') {
		// Access log with bearer tokens redacted.
		console.log(`[${event.locals.requestId}] ${event.request.method} ${redactPath(path)} ${response.status} ${Date.now() - started}ms`);
	}
	return response;
};

export const handleError: HandleServerError = ({ error, event, status }) => {
	if (status !== 404) console.error(`[error] ${event.request.method} ${redactPath(event.url.pathname)}:`, error);
	return { message: status === 404 ? 'Not found' : 'Something went wrong' };
};
