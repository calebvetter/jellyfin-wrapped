import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, _setDbForTests, run, get } from '../src/lib/server/db';
import { _setSecretForTests } from '../src/lib/server/crypto';
import { _setConfigForTests } from '../src/lib/server/config';
import { listUserRows, setIncluded } from '../src/lib/server/admin';
import {
	audioDir,
	customSfx,
	defaultSfxSegment,
	deleteAudio,
	isSfxName,
	resetSfx,
	setSegment,
	setSfxUpload,
	setSlot,
	slotAssignments,
	slotTracks
} from '../src/lib/server/soundtrack';
import { GENERIC_KEY } from '../src/lib/shared/music';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapped-audio-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

beforeEach(() => {
	_setSecretForTests('test-secret-for-unit-tests-0123456789');
	_setDbForTests(openDatabase(':memory:'));
	_setConfigForTests({ dataDir: tmp });
	fs.mkdirSync(audioDir(), { recursive: true });
});

// a minimal valid WAV header + silence
function wav(seconds = 0.5): Buffer {
	const rate = 8000;
	const n = Math.round(rate * seconds);
	const b = Buffer.alloc(44 + n);
	b.write('RIFF', 0, 'latin1');
	b.writeUInt32LE(36 + n, 4);
	b.write('WAVE', 8, 'latin1');
	b.write('fmt ', 12, 'latin1');
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(rate, 24);
	b.writeUInt32LE(rate, 28);
	b.writeUInt16LE(1, 32);
	b.writeUInt16LE(8, 34);
	b.write('data', 36, 'latin1');
	b.writeUInt32LE(n, 40);
	b.fill(128, 44);
	return b;
}

function addGeneric(id: string) {
	fs.writeFileSync(path.join(audioDir(), `${id}.mp3`), 'x');
	run(
		`INSERT INTO soundtrack_audio (id, title_key, source, file, mime, bytes, duration, created_at) VALUES (?, ?, 'youtube', ?, 'audio/mpeg', 1, 60, ?)`,
		id,
		GENERIC_KEY,
		`${id}.mp3`,
		Date.now()
	);
}

describe('user inclusion', () => {
	it('includes everyone by default and can uncheck/recheck users', () => {
		for (const id of ['a', 'b', 'c']) run('INSERT INTO users (id, name, synced_at) VALUES (?, ?, 0)', id, id.toUpperCase());
		expect(listUserRows().every((u) => u.included === 1)).toBe(true);
		expect(setIncluded(['a', 'c', 'nope'], false)).toBe(2);
		expect(listUserRows().filter((u) => u.included).map((u) => u.id)).toEqual(['b']);
		setIncluded(['a'], true);
		expect(get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE included = 1')?.n).toBe(2);
	});
});

describe('generic music slots', () => {
	it('assigns generic tracks to screens and clears them when removed', () => {
		addGeneric('g1');
		setSlot('intro', 'g1');
		setSlot('summary', 'g1');
		expect(slotAssignments()).toEqual({ intro: 'g1', summary: 'g1' });
		expect(slotTracks().intro?.id).toBe('g1');
		setSlot('summary', null);
		expect(slotAssignments()).toEqual({ intro: 'g1' });
		deleteAudio('g1');
		expect(slotAssignments()).toEqual({});
	});

	it('only accepts generic tracks', () => {
		run(
			`INSERT INTO soundtrack_audio (id, title_key, source, file, mime, bytes, created_at) VALUES ('t1', 'movie:x', 'deezer', 't1.mp3', 'audio/mpeg', 1, 0)`
		);
		expect(() => setSlot('intro', 't1')).toThrow();
		expect(() => setSlot('intro', 'missing')).toThrow();
	});
});

describe('sound effects', () => {
	it('knows its sound names and default segments', () => {
		expect(isSfxName('whoosh')).toBe(true);
		expect(isSfxName('../etc')).toBe(false);
		expect(defaultSfxSegment(null)).toEqual({ start: 0, end: null });
		expect(defaultSfxSegment(1.2)).toEqual({ start: 0, end: null });
		expect(defaultSfxSegment(240)).toEqual({ start: 0, end: 2 });
	});

	it('replaces, trims and resets a sound effect', () => {
		const a = setSfxUpload('pop', wav(), 'my pop.wav', 'audio/wav', 0.5);
		expect(a.title_key).toBe('sfx:pop');
		expect(a.track_title).toBe('my pop');
		expect(customSfx().pop).toMatchObject({ url: `/audio/t/${a.id}`, start: 0, end: null });

		// replacing removes the previous file
		const b = setSfxUpload('pop', wav(), 'other.wav', 'audio/wav', 0.5);
		expect(fs.existsSync(path.join(audioDir(), a.file))).toBe(false);
		expect(get('SELECT 1 FROM soundtrack_audio WHERE id = ?', a.id)).toBeUndefined();

		// sound effects can be trimmed to a fraction of a second (music can't)
		setSegment(b.id, 0.1, 0.25);
		expect(customSfx().pop).toMatchObject({ start: 0.1, end: 0.25 });

		resetSfx('pop');
		expect(customSfx().pop).toBeUndefined();
		expect(fs.existsSync(path.join(audioDir(), b.file))).toBe(false);
	});

	it('starts long uploads trimmed and rejects non-audio', () => {
		const long = setSfxUpload('thud', wav(), 'long.wav', 'audio/wav', 12);
		expect(long.segment_end).toBe(2);
		expect(() => setSfxUpload('thud', Buffer.from('<html>not audio</html>'), 'x.wav', 'audio/wav')).toThrow(/look like audio/);
		expect(() => setSfxUpload('thud', wav(), 'x.exe', 'application/octet-stream')).toThrow(/Unsupported/);
	});
});
