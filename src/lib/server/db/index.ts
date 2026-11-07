/**
 * SQLite persistence (Node's built-in `node:sqlite`, no native build step).
 * One file in DATA_DIR holds sessions, prepared datasets, cached metadata,
 * personal links, analytics and soundtrack assignments.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { MIGRATIONS } from './migrations';

let db: DatabaseSync | null = null;
const stmtCache = new Map<string, StatementSync>();

export function getDb(): DatabaseSync {
	if (db) return db;
	const dir = config().dataDir;
	fs.mkdirSync(dir, { recursive: true });
	db = openDatabase(path.join(dir, 'wrapped.db'));
	return db;
}

export function openDatabase(file: string): DatabaseSync {
	const d = new DatabaseSync(file);
	d.exec('PRAGMA journal_mode = WAL;');
	d.exec('PRAGMA synchronous = NORMAL;');
	d.exec('PRAGMA foreign_keys = ON;');
	d.exec('PRAGMA busy_timeout = 5000;');
	migrate(d);
	return d;
}

/** Replace the process-wide database (tests use an in-memory DB). */
export function _setDbForTests(d: DatabaseSync) {
	db = d;
	stmtCache.clear();
}

function migrate(d: DatabaseSync) {
	d.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
	const row = d.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
	let version = row?.version ?? 0;
	if (!row) d.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
	for (let i = version; i < MIGRATIONS.length; i++) {
		d.exec('BEGIN');
		try {
			d.exec(MIGRATIONS[i]);
			d.prepare('UPDATE schema_version SET version = ?').run(i + 1);
			d.exec('COMMIT');
			version = i + 1;
		} catch (e) {
			d.exec('ROLLBACK');
			throw e;
		}
	}
}

function stmt(sql: string): StatementSync {
	let s = stmtCache.get(sql);
	if (!s) {
		s = getDb().prepare(sql);
		stmtCache.set(sql, s);
	}
	return s;
}

type Param = string | number | bigint | null | Uint8Array;

export function all<T>(sql: string, ...params: Param[]): T[] {
	return stmt(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
	return stmt(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]) {
	return stmt(sql).run(...params);
}

let txDepth = 0;
/** Run `fn` inside a transaction (nested calls join the outer transaction). */
export function tx<T>(fn: () => T): T {
	const d = getDb();
	if (txDepth > 0) return fn();
	d.exec('BEGIN IMMEDIATE');
	txDepth++;
	try {
		const result = fn();
		d.exec('COMMIT');
		return result;
	} catch (e) {
		d.exec('ROLLBACK');
		throw e;
	} finally {
		txDepth--;
	}
}

export function getSetting(key: string): string | null {
	return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
	if (value === null) run('DELETE FROM settings WHERE key = ?', key);
	else run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
