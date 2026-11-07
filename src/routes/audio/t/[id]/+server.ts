import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { audioById, audioDir, restorePreview } from '$lib/server/soundtrack';
import type { RequestHandler } from './$types';

/**
 * Soundtrack audio (cached Deezer previews + Jellyfin theme songs), by unguessable id.
 * HTTP Range support is required: Safari needs it, and the player seeks straight to each
 * track's best section.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	if (!/^[A-Za-z0-9_-]{8,32}$/.test(params.id)) error(404, 'Not found');
	const track = audioById(params.id);
	if (!track) error(404, 'Not found');
	const file = path.join(audioDir(), track.file);
	// a cached Deezer preview that went missing is fetched again transparently
	if (!fs.existsSync(file) && !(await restorePreview(track))) error(404, 'Not found');
	const size = fs.statSync(file).size;
	const headers: Record<string, string> = {
		'Content-Type': track.mime,
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'public, max-age=31536000, immutable'
	};
	const m = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
	if (m && (m[1] || m[2])) {
		let start = m[1] ? Number(m[1]) : size - Number(m[2]);
		let end = m[1] && m[2] ? Number(m[2]) : size - 1;
		start = Math.max(0, start);
		end = Math.min(size - 1, end);
		if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
		return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, {
			status: 206,
			headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
		});
	}
	return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } });
};
