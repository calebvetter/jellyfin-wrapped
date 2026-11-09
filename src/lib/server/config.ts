/**
 * Central, validated runtime configuration. Every credential and connection URL
 * comes from environment variables (never from the admin UI or the database).
 */
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import path from 'node:path';

function str(name: string, fallback = ''): string {
	const v = env[name] ?? process.env[name];
	return (v ?? fallback).trim();
}

function bool(name: string, fallback: boolean): boolean {
	const v = str(name);
	if (!v) return fallback;
	return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function num(name: string, fallback: number): number {
	const v = Number(str(name));
	return Number.isFinite(v) && str(name) !== '' ? v : fallback;
}

function url(name: string): string {
	return str(name).replace(/\/+$/, '');
}

export interface AppConfig {
	jellyfin: { url: string; apiKey: string };
	jellystat: { url: string; apiKey: string };
	seerr: { url: string; apiKey: string };
	/** Public Deezer API (no key): soundtrack track lists, popularity and 30 s previews. */
	deezer: { enabled: boolean; url: string };
	appSecret: string;
	dataDir: string;
	mockPreview: boolean;
	cookieSecure: 'auto' | boolean;
	sessionTtlHours: number;
	dev: boolean;
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
	if (cached) return cached;
	const secureRaw = str('COOKIE_SECURE', 'auto').toLowerCase();
	cached = {
		jellyfin: { url: url('JELLYFIN_URL'), apiKey: str('JELLYFIN_API_KEY') },
		jellystat: { url: url('JELLYSTAT_URL'), apiKey: str('JELLYSTAT_API_KEY') },
		seerr: { url: url('SEERR_URL'), apiKey: str('SEERR_API_KEY') },
		deezer: { enabled: bool('DEEZER_ENABLED', true), url: url('DEEZER_API_URL') || 'https://api.deezer.com' },
		appSecret: str('APP_SECRET'),
		dataDir: path.resolve(str('DATA_DIR', dev ? './data' : '/data')),
		mockPreview: bool('MOCK_PREVIEW', dev),
		cookieSecure: secureRaw === 'auto' ? 'auto' : ['1', 'true', 'yes'].includes(secureRaw),
		sessionTtlHours: num('SESSION_TTL_HOURS', 24 * 14),
		dev
	};
	return cached;
}

/** Human-readable list of configuration problems (shown in admin + /api/health detail). */
export function configProblems(): string[] {
	const c = config();
	const problems: string[] = [];
	if (!c.jellyfin.url) problems.push('JELLYFIN_URL is not set');
	if (!c.jellyfin.apiKey) problems.push('JELLYFIN_API_KEY is not set');
	if (!c.jellystat.url) problems.push('JELLYSTAT_URL is not set');
	if (!c.jellystat.apiKey) problems.push('JELLYSTAT_API_KEY is not set');
	if (!c.seerr.url || !c.seerr.apiKey) problems.push('SEERR_URL / SEERR_API_KEY not set (request slides and TMDb enrichment disabled)');
	if (c.appSecret.length > 0 && c.appSecret.length < 32) problems.push('APP_SECRET is shorter than 32 characters (a generated secret in DATA_DIR is used instead)');
	if (!c.dev && !(env.ORIGIN ?? process.env.ORIGIN)) {
		problems.push('ORIGIN is not set — sign-in and admin forms are rejected unless ORIGIN matches the URL users visit (e.g. https://wrapped.example.com)');
	}
	return problems;
}

export function seerrEnabled(): boolean {
	const c = config();
	return Boolean(c.seerr.url && c.seerr.apiKey);
}

/** Test hook. */
export function _setConfigForTests(partial: Partial<AppConfig>) {
	cached = { ...config(), ...partial } as AppConfig;
}
