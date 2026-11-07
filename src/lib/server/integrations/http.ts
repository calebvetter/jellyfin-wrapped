/**
 * Small fetch wrapper for upstream services: timeouts, bounded retries with backoff,
 * JSON parsing, and errors that never include credentials.
 */

export class UpstreamError extends Error {
	constructor(
		public service: string,
		public status: number,
		message: string
	) {
		super(`${service}: ${message}`);
	}
}

export interface RequestOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
	timeoutMs?: number;
	retries?: number;
	/** Return null instead of throwing on 404. */
	allow404?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip query strings (may contain keys) from URLs used in messages. */
export function redactUrl(u: string): string {
	try {
		const parsed = new URL(u);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return '[url]';
	}
}

export async function requestJson<T>(service: string, url: string, opts: RequestOptions = {}): Promise<T | null> {
	const retries = opts.retries ?? 2;
	let lastErr: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
		try {
			const res = await fetch(url, {
				method: opts.method ?? 'GET',
				headers: {
					Accept: 'application/json',
					...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
					...opts.headers
				},
				body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
				signal: controller.signal
			});
			if (res.status === 404 && opts.allow404) return null;
			if (!res.ok) {
				const text = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
				const err = new UpstreamError(service, res.status, `HTTP ${res.status} for ${redactUrl(url)} ${text}`);
				// Retry only transient failures.
				if (res.status >= 500 || res.status === 429) {
					lastErr = err;
					await sleep(400 * 2 ** attempt);
					continue;
				}
				throw err;
			}
			const text = await res.text();
			return (text ? JSON.parse(text) : null) as T;
		} catch (e) {
			if (e instanceof UpstreamError) throw e;
			lastErr =
				(e as Error).name === 'AbortError'
					? new UpstreamError(service, 0, `timeout for ${redactUrl(url)}`)
					: new UpstreamError(service, 0, `${(e as Error).message} (${redactUrl(url)})`);
			if (attempt < retries) await sleep(400 * 2 ** attempt);
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastErr;
}

export async function fetchBinary(
	url: string,
	headers: Record<string, string> = {},
	timeoutMs = 20_000
): Promise<{ bytes: Buffer; mime: string } | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { headers, signal: controller.signal });
		if (!res.ok) return null;
		const mime = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
		if (!mime.startsWith('image/')) return null;
		const bytes = Buffer.from(await res.arrayBuffer());
		if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) return null;
		return { bytes, mime };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** Run async tasks with bounded concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return results;
}
