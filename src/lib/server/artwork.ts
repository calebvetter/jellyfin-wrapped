/**
 * Persistent artwork cache. Posters, backdrops and portraits are downloaded once (from
 * Jellyfin, Seerr's TMDb image proxy, or TMDb directly) and served from DATA_DIR, so art
 * survives library deletions and the player never hits upstream services.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { get, run } from './db';
import { sha256 } from './crypto';
import { fetchBinary } from './integrations/http';

export interface ArtSource {
	/** Stable identity of the image, e.g. "jf:<itemId>:Primary" or "tmdb:/abc.jpg:w500". */
	key: string;
	/** Candidate URLs, tried in order. */
	urls: string[];
	headers?: Record<string, string>;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

export function artDir(): string {
	return path.join(config().dataDir, 'artwork');
}

export function artUrl(hash: string): string {
	return `/art/${hash}`;
}

interface ArtRow {
	hash: string;
	file: string | null;
	mime: string | null;
	status: string;
	created_at: number;
}

export function lookupArt(hash: string): { file: string; mime: string } | null {
	if (!/^[a-f0-9]{64}$/.test(hash)) return null;
	const row = get<ArtRow>('SELECT * FROM artwork WHERE hash = ?', hash);
	if (!row || row.status !== 'ok' || !row.file || !row.mime) return null;
	const file = path.join(artDir(), row.file);
	return fs.existsSync(file) ? { file, mime: row.mime } : null;
}

const inflight = new Map<string, Promise<string | null>>();

/**
 * Ensure an image is cached locally; returns its local URL or null.
 * A previously cached file is kept even if the source has since disappeared.
 * Missing images are retried at most once a day.
 */
export function ensureArt(src: ArtSource | null | undefined): Promise<string | null> {
	if (!src || !src.urls.length) return Promise.resolve(null);
	const hash = sha256(src.key);
	const existing = inflight.get(hash);
	if (existing) return existing;
	const p = (async () => {
		const row = get<ArtRow>('SELECT * FROM artwork WHERE hash = ?', hash);
		if (row?.status === 'ok' && row.file && fs.existsSync(path.join(artDir(), row.file))) return artUrl(hash);
		if (row?.status === 'missing' && Date.now() - row.created_at < 86_400_000) return null;
		for (const url of src.urls) {
			const img = await fetchBinary(url, url.startsWith(config().jellyfin.url) ? src.headers : undefined);
			if (!img) continue;
			const ext = EXT[img.mime] ?? 'img';
			const rel = path.join(hash.slice(0, 2), `${hash}.${ext}`);
			const abs = path.join(artDir(), rel);
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			const tmp = `${abs}.tmp`;
			fs.writeFileSync(tmp, img.bytes);
			fs.renameSync(tmp, abs);
			run(
				`INSERT INTO artwork (hash, source, file, mime, bytes, status, created_at) VALUES (?, ?, ?, ?, ?, 'ok', ?)
				 ON CONFLICT(hash) DO UPDATE SET file = excluded.file, mime = excluded.mime, bytes = excluded.bytes, status = 'ok', created_at = excluded.created_at`,
				hash,
				src.key,
				rel.replace(/\\/g, '/'),
				img.mime,
				img.bytes.length,
				Date.now()
			);
			return artUrl(hash);
		}
		run(
			`INSERT INTO artwork (hash, source, status, created_at) VALUES (?, ?, 'missing', ?)
			 ON CONFLICT(hash) DO UPDATE SET status = CASE WHEN artwork.status = 'ok' THEN 'ok' ELSE 'missing' END, created_at = excluded.created_at`,
			hash,
			src.key,
			Date.now()
		);
		return null;
	})().finally(() => inflight.delete(hash));
	inflight.set(hash, p);
	return p;
}

export function artworkStats() {
	return get<{ count: number; bytes: number; missing: number }>(
		`SELECT SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS count, COALESCE(SUM(bytes),0) AS bytes,
		 SUM(CASE WHEN status='missing' THEN 1 ELSE 0 END) AS missing FROM artwork`
	);
}
