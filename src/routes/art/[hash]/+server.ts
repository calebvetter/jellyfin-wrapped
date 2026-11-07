import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import { lookupArt } from '$lib/server/artwork';
import type { RequestHandler } from './$types';

/** Cached artwork (content-addressed, immutable). */
export const GET: RequestHandler = ({ params }) => {
	const art = lookupArt(params.hash);
	if (!art) error(404, 'Not found');
	const body = fs.readFileSync(art.file);
	return new Response(body, {
		headers: {
			'Content-Type': art.mime,
			'Content-Length': String(body.length),
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
