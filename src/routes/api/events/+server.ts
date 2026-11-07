import { json } from '@sveltejs/kit';
import { safeIngest, type EventBatch } from '$lib/server/analytics';
import type { RequestHandler } from './$types';

/** First-party engagement events (token-authorized, small delta batches). */
export const POST: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (text.length > 32_000) return json({ error: 'too large' }, { status: 413 });
	let batch: EventBatch;
	try {
		batch = JSON.parse(text);
	} catch {
		return json({ error: 'bad json' }, { status: 400 });
	}
	const r = safeIngest(batch);
	return r.ok ? new Response(null, { status: 204 }) : json({ error: r.reason }, { status: r.status });
};
