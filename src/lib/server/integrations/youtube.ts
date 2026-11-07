/**
 * Audio from YouTube via yt-dlp.
 *
 *  - Only YouTube URLs are accepted; they're reduced to a video id and rebuilt as a canonical
 *    https://www.youtube.com/watch?v=<id> URL, so no arbitrary URL or option reaches yt-dlp.
 *  - The native audio stream is downloaded (m4a/AAC preferred — plays everywhere incl.
 *    Safari — else webm/Opus); no ffmpeg needed. The admin then picks a segment.
 *  - YouTube requires a JavaScript runtime for yt-dlp: we point it at the Node binary that
 *    runs this app (Deno is used instead if installed).
 *  - yt-dlp is found via YTDLP_PATH, else `yt-dlp` on PATH. In Docker it's preinstalled.
 *    A path ending in .js/.mjs is run with Node (used by the e2e fake).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { config } from '../config';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const MAX_DURATION_SEC = 20 * 60;

/** Extract the 11-character video id from any common YouTube URL form (or a bare id). */
export function parseYouTubeId(input: string): string | null {
	const s = input.trim();
	if (VIDEO_ID.test(s)) return s;
	let u: URL;
	try {
		u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
	let id: string | null = null;
	if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
	else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		if (u.pathname === '/watch') id = u.searchParams.get('v');
		else {
			const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
			id = m?.[1] ?? null;
		}
	}
	return id && VIDEO_ID.test(id) ? id : null;
}

export function canonicalUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`;
}

function command(): { cmd: string; pre: string[] } {
	const configured = (env.YTDLP_PATH ?? process.env.YTDLP_PATH ?? '').trim();
	if (configured && /\.(c|m)?js$/i.test(configured)) return { cmd: process.execPath, pre: [configured] };
	return { cmd: configured || 'yt-dlp', pre: [] };
}

function runYtDlp(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
	const { cmd, pre } = command();
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, [...pre, ...args], { windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
		let stdout = '';
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error('yt-dlp timed out'));
		}, timeoutMs);
		child.stdout.on('data', (d) => (stdout += d));
		child.stderr.on('data', (d) => (stderr += d));
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code: code ?? 1, stdout, stderr });
		});
	});
}

let statusCache: { at: number; value: { available: boolean; version: string | null; error: string | null } } | null = null;

/** Is yt-dlp installed? (cached for 10 minutes) */
export async function ytdlpStatus() {
	if (statusCache && Date.now() - statusCache.at < 600_000) return statusCache.value;
	let value: { available: boolean; version: string | null; error: string | null };
	try {
		const r = await runYtDlp(['--version'], 15_000);
		value = r.code === 0 ? { available: true, version: r.stdout.trim().split('\n')[0], error: null } : { available: false, version: null, error: r.stderr.trim().slice(0, 200) };
	} catch (e) {
		value = { available: false, version: null, error: (e as Error).message };
	}
	statusCache = { at: Date.now(), value };
	return value;
}

const MIME_BY_EXT: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', opus: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };

export interface YouTubeAudio {
	file: string; // absolute path of the downloaded audio
	mime: string;
	title: string;
	uploader: string | null;
	duration: number | null;
	url: string;
}

let queue: Promise<unknown> = Promise.resolve();

/** Download a video's audio into `dir` (one download at a time). */
export function downloadYouTubeAudio(id: string, dir: string): Promise<YouTubeAudio> {
	const job = queue.then(() => doDownload(id, dir));
	queue = job.catch(() => {});
	return job;
}

async function doDownload(id: string, dir: string): Promise<YouTubeAudio> {
	if (!VIDEO_ID.test(id)) throw new Error('Not a YouTube video id');
	fs.mkdirSync(dir, { recursive: true });
	const stem = `yt-${id}-${Date.now().toString(36)}`;
	const args = [
		'--no-playlist',
		'--no-progress',
		'--no-warnings',
		'--no-mtime',
		'--cache-dir',
		path.join(config().dataDir, '.cache', 'yt-dlp'),
		'--js-runtimes',
		`node:${process.execPath}`,
		'-f',
		'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
		'--max-filesize',
		'80M',
		'--match-filter',
		`duration <= ${MAX_DURATION_SEC}`,
		'-o',
		path.join(dir, `${stem}.%(ext)s`),
		'--no-simulate',
		'--dump-json',
		canonicalUrl(id)
	];
	const r = await runYtDlp(args, 5 * 60_000).catch((e) => {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('yt-dlp is not installed on the server');
		throw e;
	});
	const downloaded = fs.readdirSync(dir).find((f) => f.startsWith(stem + '.') && !f.endsWith('.part'));
	if (r.code !== 0 || !downloaded) {
		const msg = r.stderr.split('\n').find((l) => l.startsWith('ERROR')) ?? r.stderr.trim().split('\n').pop() ?? '';
		if (/does not pass filter/i.test(r.stdout + r.stderr)) throw new Error(`Video is longer than ${MAX_DURATION_SEC / 60} minutes`);
		throw new Error(msg.replace(/^ERROR:\s*/, '').slice(0, 300) || 'yt-dlp failed to download this video');
	}
	let info: { title?: string; uploader?: string; channel?: string; duration?: number; ext?: string } = {};
	try {
		info = JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}');
	} catch {
		/* metadata is optional */
	}
	const ext = path.extname(downloaded).slice(1).toLowerCase();
	return {
		file: path.join(dir, downloaded),
		mime: MIME_BY_EXT[ext] ?? 'audio/mp4',
		title: info.title ?? `YouTube ${id}`,
		uploader: info.uploader ?? info.channel ?? null,
		duration: typeof info.duration === 'number' ? info.duration : null,
		url: canonicalUrl(id)
	};
}
