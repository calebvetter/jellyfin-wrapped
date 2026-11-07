import { error } from '@sveltejs/kit';
import { previewUrl } from '$lib/server/integrations/deezer';
import type { RequestHandler } from './$types';

/**
 * Deezer's 30-second preview for a track, proxied (admin-only via hooks): keeps the CSP
 * same-origin, always uses a freshly signed URL, and lets the browser decode it for
 * best-section matching.
 */
export const GET: RequestHandler = async ({ params }) => {
	const id = Number(params.trackId);
	if (!Number.isInteger(id) || id <= 0) error(400, 'Bad track id');
	const url = await previewUrl(id).catch(() => null);
	if (!url) error(404, 'No preview for this track');
	const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) error(502, 'Preview unavailable');
	const bytes = Buffer.from(await res.arrayBuffer());
	return new Response(bytes, {
		headers: { 'Content-Type': res.headers.get('content-type') ?? 'audio/mpeg', 'Content-Length': String(bytes.length), 'Cache-Control': 'private, max-age=600' }
	});
};
