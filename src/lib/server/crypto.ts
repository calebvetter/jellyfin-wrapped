/**
 * Security primitives: random tokens, hashing, authenticated encryption and HMAC signing.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

let secretCache: Buffer | null = null;

/**
 * Master secret. Prefer APP_SECRET from the environment; otherwise a random secret is
 * generated once and persisted in DATA_DIR so links/sessions survive restarts.
 */
export function masterSecret(): Buffer {
	if (secretCache) return secretCache;
	const fromEnv = config().appSecret;
	if (fromEnv.length >= 32) {
		secretCache = crypto.createHash('sha256').update(fromEnv).digest();
		return secretCache;
	}
	const file = path.join(config().dataDir, '.app-secret');
	try {
		const existing = fs.readFileSync(file, 'utf8').trim();
		if (existing.length >= 64) {
			secretCache = Buffer.from(existing, 'hex');
			return secretCache;
		}
	} catch {
		/* create below */
	}
	fs.mkdirSync(config().dataDir, { recursive: true });
	const generated = crypto.randomBytes(32);
	fs.writeFileSync(file, generated.toString('hex'), { mode: 0o600 });
	console.warn('[crypto] APP_SECRET not set — generated a persistent secret in DATA_DIR/.app-secret');
	secretCache = generated;
	return secretCache;
}

export function _setSecretForTests(secret: string) {
	secretCache = crypto.createHash('sha256').update(secret).digest();
}

function subKey(purpose: string): Buffer {
	return crypto.createHmac('sha256', masterSecret()).update(`jellyfin-wrapped:${purpose}`).digest();
}

/** 256-bit URL-safe random token. */
export function randomToken(bytes = 32): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

export function randomId(bytes = 12): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

/** Keyed hash used for token lookup (a DB leak alone can't be used to forge lookups). */
export function tokenHash(token: string, purpose = 'token'): string {
	return crypto.createHmac('sha256', subKey(`hash:${purpose}`)).update(token).digest('hex');
}

export function sha256(input: string | Buffer): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export function encrypt(plaintext: string): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', subKey('enc'), iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1.${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decrypt(payload: string): string | null {
	try {
		const [v, ivB, ctB, tagB] = payload.split('.');
		if (v !== 'v1') return null;
		const decipher = crypto.createDecipheriv('aes-256-gcm', subKey('enc'), Buffer.from(ivB, 'base64url'));
		decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
		return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}

/** Compact signed token: base64url(json).base64url(hmac). */
export function sign(data: object, purpose: string): string {
	const body = Buffer.from(JSON.stringify(data)).toString('base64url');
	const mac = crypto.createHmac('sha256', subKey(`sign:${purpose}`)).update(body).digest('base64url');
	return `${body}.${mac}`;
}

export function verify<T>(token: string, purpose: string): T | null {
	if (typeof token !== 'string' || token.length > 4096) return null;
	const [body, mac] = token.split('.');
	if (!body || !mac) return null;
	const expected = crypto.createHmac('sha256', subKey(`sign:${purpose}`)).update(body).digest();
	const given = Buffer.from(mac, 'base64url');
	if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
	try {
		return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
	} catch {
		return null;
	}
}
