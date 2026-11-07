/**
 * Soundtracks from the movies and shows people actually watched.
 *
 *  - featuredTitles(): which titles appear on slides across a year's prepared Wrappeds.
 *  - refreshSoundtracks(): during preparation, match each featured title to its Deezer
 *    soundtrack album (track list ordered by popularity) and cache any Jellyfin theme songs.
 *  - Admins pick a track per title ("Use"); its 30-second Deezer preview — which is the
 *    song's hook — is downloaded once and cached locally for instant playback.
 *  - Or paste a YouTube link: yt-dlp grabs the audio and the admin chooses the segment
 *    (start → segment_end) to play. Short clips are fine: they loop smoothly.
 *  - musicFor(): the per-user plan the player receives (see music-plan.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { all, get, run, tx } from './db';
import { randomId } from './crypto';
import * as deezer from './integrations/deezer';
import * as jf from './integrations/jellyfin';
import { downloadYouTubeAudio, parseYouTubeId } from './integrations/youtube';
import { mapLimit } from './integrations/http';
import { ensureArt } from './artwork';
import { reportsForYear, activeDataset } from './reports';
import { buildMusicPlan, slideTitleKeys, type MusicPlan, type MusicTrack } from './music-plan';
import { GENERIC_KEY, MUSIC_SLOTS, type MusicSlot } from '$shared/music';
import { SFX_IDS, sfxKey, type CustomSfx, type SfxName } from '$shared/sfx';
import type { WrappedReport } from '$shared/report';

export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/flac', 'audio/x-flac'];
const EXT_BY_MIME: Record<string, string> = {
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/ogg': 'ogg',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/wave': 'wav',
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/aac': 'aac',
	'audio/webm': 'webm',
	'audio/flac': 'flac',
	'audio/x-flac': 'flac'
};
/** Re-try titles with no soundtrack found after this long. */
const RELOOKUP_MS = 14 * 86_400_000;

export function audioDir() {
	return path.join(config().dataDir, 'audio');
}

// ------------------------------------------------------------------ featured titles

export type FeatureRole = 'top1' | 'top5' | 'binge' | 'original' | 'genre' | 'actor' | 'busiest' | 'requests';
const ROLE_WEIGHT: Record<FeatureRole, number> = { top1: 3, binge: 2, original: 2, genre: 1.5, top5: 1, actor: 1, busiest: 1, requests: 0.5 };

export interface FeaturedTitle {
	key: string;
	kind: 'movie' | 'series';
	title: string;
	year: number | null;
	poster: string | null;
	users: number; // in how many Wrappeds it appears
	roles: Partial<Record<FeatureRole, number>>;
	weight: number; // how much music for this title would be heard overall
}

/** Every title shown on a slide across the given reports, most valuable first. */
export function featuredTitles(reports: WrappedReport[]): FeaturedTitle[] {
	const map = new Map<string, FeaturedTitle & { userSet: Set<string> }>();
	const add = (r: WrappedReport, t: { key: string; kind: 'movie' | 'series'; title: string; year: number | null; poster: string | null }, role: FeatureRole) => {
		let f = map.get(t.key);
		if (!f) map.set(t.key, (f = { key: t.key, kind: t.kind, title: t.title, year: t.year, poster: t.poster, users: 0, roles: {}, weight: 0, userSet: new Set() }));
		if (!f.poster && t.poster) f.poster = t.poster;
		f.userSet.add(r.userId);
		f.roles[role] = (f.roles[role] ?? 0) + 1;
		f.weight += ROLE_WEIGHT[role];
	};
	for (const r of reports) {
		for (const s of r.slides) {
			if (s.kind === 'top-shows' || s.kind === 'top-movies') s.items.forEach((t, i) => add(r, t, i === 0 ? 'top1' : 'top5'));
			else if (s.kind === 'binge') add(r, s.series, 'binge');
			else if (s.kind === 'original') add(r, s.title, 'original');
			else if (s.kind === 'genres' && s.dominant.title) add(r, s.dominant.title, 'genre');
			else if (s.kind === 'actor') s.titles.forEach((t) => add(r, t, 'actor'));
			else if (s.kind === 'busiest-day') s.titles.forEach((t) => add(r, t, 'busiest'));
			else if (s.kind === 'requests') s.goodTaste.examples.forEach((t) => add(r, t, 'requests'));
		}
	}
	return [...map.values()]
		.map(({ userSet, ...f }) => ({ ...f, users: userSet.size, weight: Math.round(f.weight * 10) / 10 }))
		.sort((a, b) => b.weight - a.weight || b.users - a.users || a.title.localeCompare(b.title));
}

// ------------------------------------------------------------------ title matches

export interface SoundtrackTitleRow {
	title_key: string;
	title: string;
	kind: 'movie' | 'series';
	year: number | null;
	status: 'pending' | 'auto' | 'confirmed' | 'none' | 'error';
	album: string | null;
	candidates: string | null;
	tracks: string | null;
	looked_up_at: number | null;
	updated_at: number;
	music_off: number;
}

export interface TitleMatch {
	status: SoundtrackTitleRow['status'];
	album: deezer.DeezerAlbum | null;
	candidates: deezer.DeezerAlbum[];
	tracks: deezer.DeezerTrack[]; // by popularity
	lookedUpAt: number | null;
	/** Admin confirmed this title gets no music of its own (its slides keep the current music). */
	musicOff: boolean;
}

const parse = <T>(s: string | null, fallback: T): T => {
	if (!s) return fallback;
	try {
		return JSON.parse(s) as T;
	} catch {
		return fallback;
	}
};

export function titleMatches(): Map<string, TitleMatch> {
	const out = new Map<string, TitleMatch>();
	for (const r of all<SoundtrackTitleRow>('SELECT * FROM soundtrack_titles')) {
		out.set(r.title_key, {
			status: r.status,
			album: parse(r.album, null),
			candidates: parse(r.candidates, []),
			tracks: parse(r.tracks, []),
			lookedUpAt: r.looked_up_at,
			musicOff: r.music_off === 1
		});
	}
	return out;
}

/** Make sure featured titles exist (so admins can look up/upload before the next preparation). */
export function ensureTitles(featured: FeaturedTitle[]) {
	for (const f of featured) upsertTitle(f);
}

function upsertTitle(t: { key: string; title: string; kind: string; year: number | null }) {
	run(
		`INSERT INTO soundtrack_titles (title_key, title, kind, year, updated_at) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(title_key) DO UPDATE SET title = excluded.title, kind = excluded.kind, year = excluded.year`,
		t.key,
		t.title,
		t.kind,
		t.year,
		Date.now()
	);
}

function saveMatch(key: string, status: SoundtrackTitleRow['status'], album: deezer.DeezerAlbum | null, candidates: deezer.DeezerAlbum[], tracks: deezer.DeezerTrack[]) {
	run(
		`UPDATE soundtrack_titles SET status = ?, album = ?, candidates = ?, tracks = ?, looked_up_at = ?, updated_at = ? WHERE title_key = ?`,
		status,
		album ? JSON.stringify(album) : null,
		JSON.stringify(candidates),
		JSON.stringify([...tracks].sort((a, b) => b.rank - a.rank)),
		Date.now(),
		Date.now(),
		key
	);
}

/** Look up a title's soundtrack on Deezer and store the best match + alternatives. */
export async function lookupTitle(key: string): Promise<TitleMatch['status']> {
	const row = get<SoundtrackTitleRow>('SELECT * FROM soundtrack_titles WHERE title_key = ?', key);
	if (!row) throw new Error('Unknown title');
	try {
		const candidates = await deezer.findSoundtrackAlbums(row.title, row.kind, row.year);
		const best = candidates[0] && (candidates[0].score ?? 0) >= deezer.MIN_ALBUM_SCORE ? candidates[0] : null;
		const tracks = best ? await deezer.albumTracks(best.id) : [];
		saveMatch(key, best ? 'auto' : 'none', best, candidates, tracks);
		return best ? 'auto' : 'none';
	} catch (e) {
		run('UPDATE soundtrack_titles SET status = ?, looked_up_at = ?, updated_at = ? WHERE title_key = ?', 'error', Date.now(), Date.now(), key);
		throw e;
	}
}

/** Admin picks an album (from candidates or a search) — or declares there's no soundtrack. */
export async function chooseAlbum(key: string, album: deezer.DeezerAlbum | null) {
	const row = get<SoundtrackTitleRow>('SELECT * FROM soundtrack_titles WHERE title_key = ?', key);
	if (!row) throw new Error('Unknown title');
	const candidates = parse<deezer.DeezerAlbum[]>(row.candidates, []);
	if (album && !candidates.some((c) => c.id === album.id)) candidates.unshift(album);
	const tracks = album ? await deezer.albumTracks(album.id) : [];
	saveMatch(key, album ? 'confirmed' : 'none', album, candidates, tracks);
}

export function confirmAlbum(key: string) {
	run("UPDATE soundtrack_titles SET status = 'confirmed', updated_at = ? WHERE title_key = ? AND album IS NOT NULL", Date.now(), key);
}

/**
 * Confirm a title gets no music of its own (nothing good to use). Its picked track is
 * removed and its theme song is ignored; slides featuring it keep the music already
 * playing. Picking a track or grabbing from YouTube later turns music back on.
 */
export function setMusicOff(key: string, off: boolean) {
	if (!get('SELECT 1 FROM soundtrack_titles WHERE title_key = ?', key)) throw new Error('Unknown title');
	if (off) clearSelection(key);
	run('UPDATE soundtrack_titles SET music_off = ?, updated_at = ? WHERE title_key = ?', off ? 1 : 0, Date.now(), key);
	invalidateFallback();
}

// ------------------------------------------------------------------ audio files

export interface AudioRow {
	id: string;
	title_key: string;
	source: 'deezer' | 'youtube' | 'theme' | 'upload'; // 'upload' only exists in older databases
	deezer_track_id: number | null;
	jf_item_id: string | null;
	track_title: string | null;
	artist: string | null;
	file: string;
	original_name: string | null;
	mime: string;
	bytes: number;
	duration: number | null;
	start: number;
	start_method: 'preview' | 'energy' | 'manual' | 'default';
	confidence: number | null;
	envelope: string | null;
	gain: number;
	enabled: number;
	created_at: number;
	segment_end: number | null;
	source_url: string | null;
}

export function listAudio(): AudioRow[] {
	return all<AudioRow>('SELECT * FROM soundtrack_audio ORDER BY created_at DESC');
}

export function audioById(id: string): AudioRow | undefined {
	return get<AudioRow>('SELECT * FROM soundtrack_audio WHERE id = ?', id);
}

/** Sniff common audio container signatures so arbitrary files can't be uploaded as audio. */
export function looksLikeAudio(buf: Buffer): boolean {
	if (buf.length < 12) return false;
	const s4 = buf.subarray(0, 4).toString('latin1');
	if (buf.subarray(0, 3).toString('latin1') === 'ID3') return true; // mp3 with ID3 tag
	if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // mpeg/aac frame sync
	if (s4 === 'OggS' || s4 === 'fLaC') return true;
	if (s4 === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return true;
	if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return true; // mp4/m4a
	if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true; // webm
	return false;
}

function writeAudioFile(prefix: string, data: Buffer, mime: string): string {
	fs.mkdirSync(audioDir(), { recursive: true });
	const file = `${prefix}-${randomId(8)}.${EXT_BY_MIME[mime] ?? 'bin'}`;
	fs.writeFileSync(path.join(audioDir(), file), data);
	return file;
}

/** Download a track's 30-second Deezer preview (fresh signed URL each time). */
async function downloadPreview(trackId: number): Promise<{ bytes: Buffer; mime: string }> {
	const url = await deezer.previewUrl(trackId);
	if (!url) throw new Error('Deezer has no preview for this track');
	const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`Preview download failed (HTTP ${res.status})`);
	const mime = (res.headers.get('content-type') ?? 'audio/mpeg').split(';')[0].trim().toLowerCase();
	const bytes = Buffer.from(await res.arrayBuffer());
	if (!bytes.length || bytes.length > 10 * 1024 * 1024 || !looksLikeAudio(bytes)) throw new Error('Preview is not valid audio');
	return { bytes, mime: AUDIO_MIME_TYPES.includes(mime) ? mime : 'audio/mpeg' };
}

/**
 * Use a track as a title's music: cache its 30-second Deezer preview (the hook) locally and
 * replace any previous selection for the title. Only tracks of the title's matched album
 * can be selected.
 */
export async function selectTrack(titleKey: string, trackId: number): Promise<AudioRow> {
	const match = titleMatches().get(titleKey);
	const track = match?.tracks.find((t) => t.id === trackId);
	if (!track) throw new Error("That track isn't on this title's soundtrack");
	const { bytes, mime } = await downloadPreview(trackId);
	const file = writeAudioFile('dz', bytes, mime);
	return replaceSelection(titleKey, {
		source: 'deezer',
		deezerTrackId: trackId,
		trackTitle: track.title,
		artist: track.artist,
		file,
		originalName: `deezer-${trackId}`,
		mime,
		bytes: bytes.length,
		duration: Math.min(30, track.duration),
		start: 0,
		segmentEnd: null,
		sourceUrl: null
	});
}

interface NewAudio {
	source: 'deezer' | 'youtube' | 'upload';
	deezerTrackId: number | null;
	trackTitle: string;
	artist: string | null;
	file: string; // file name inside audioDir()
	originalName: string;
	mime: string;
	bytes: number;
	duration: number | null;
	start: number;
	segmentEnd: number | null;
	sourceUrl: string | null;
}

function insertRow(id: string, key: string, a: NewAudio) {
	run(
		`INSERT INTO soundtrack_audio (id, title_key, source, deezer_track_id, track_title, artist, file, original_name, mime, bytes, duration, start, segment_end, source_url, start_method, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		key,
		a.source,
		a.deezerTrackId,
		a.trackTitle.slice(0, 200),
		a.artist?.slice(0, 200) ?? null,
		a.file,
		a.originalName.slice(0, 200),
		a.mime,
		a.bytes,
		a.duration,
		a.start,
		a.segmentEnd,
		a.sourceUrl,
		a.source === 'deezer' ? 'preview' : 'manual',
		Date.now()
	);
}

/**
 * Store new audio under `key`. With `replace`, any previous non-theme audio for the key is
 * removed in the same transaction (a title's selection, a sound effect); without it the
 * audio is added (the generic-music pool).
 */
function storeAudio(key: string, a: NewAudio, replace: boolean): AudioRow {
	const id = randomId(12);
	const previous = replace ? all<AudioRow>("SELECT * FROM soundtrack_audio WHERE title_key = ? AND source <> 'theme'", key) : [];
	try {
		tx(() => {
			// choosing music for a title undoes an earlier "no music" decision
			run('UPDATE soundtrack_titles SET music_off = 0 WHERE title_key = ?', key);
			for (const p of previous) {
				run('DELETE FROM soundtrack_audio WHERE id = ?', p.id);
				run('DELETE FROM music_slots WHERE audio_id = ?', p.id);
			}
			insertRow(id, key, a);
		});
	} catch (e) {
		fs.rmSync(path.join(audioDir(), a.file), { force: true });
		throw e;
	}
	for (const p of previous) fs.rmSync(path.join(audioDir(), p.file), { force: true });
	invalidateFallback();
	return audioById(id)!;
}

/** Make `a` the title's selected music, atomically replacing any previous selection. */
function replaceSelection(titleKey: string, a: NewAudio): AudioRow {
	return storeAudio(titleKey, a, true);
}

/** Download a YouTube link's audio (yt-dlp) and describe it as NewAudio. */
async function grabYouTube(url: string, segment: (duration: number | null) => { start: number; end: number | null }): Promise<NewAudio> {
	const videoId = parseYouTubeId(url);
	if (!videoId) throw new Error("That doesn't look like a YouTube link");
	const yt = await downloadYouTubeAudio(videoId, audioDir());
	const seg = segment(yt.duration);
	return {
		source: 'youtube',
		deezerTrackId: null,
		trackTitle: yt.title,
		artist: yt.uploader,
		file: path.basename(yt.file),
		originalName: `youtube-${videoId}`,
		mime: yt.mime,
		bytes: fs.statSync(yt.file).size,
		duration: yt.duration,
		start: seg.start,
		segmentEnd: seg.end,
		sourceUrl: yt.url
	};
}

/** Default segment for freshly grabbed audio: short clips play whole; longer ones get 30 s. */
export function defaultSegment(duration: number | null): { start: number; end: number | null } {
	if (!duration || duration <= 30) return { start: 0, end: null };
	return { start: 0, end: 30 };
}

/**
 * Grab audio from a YouTube link with yt-dlp and make it the title's music. The admin then
 * picks the segment to play (setSegment).
 */
export async function addYouTube(titleKey: string, url: string): Promise<AudioRow> {
	if (!get('SELECT 1 FROM soundtrack_titles WHERE title_key = ?', titleKey)) throw new Error('Unknown title');
	return replaceSelection(titleKey, await grabYouTube(url, defaultSegment));
}

// ------------------------------------------------------------------ generic music

/** Add a YouTube grab to the generic-music pool (tracks not tied to any title). */
export async function addGenericYouTube(url: string): Promise<AudioRow> {
	return storeAudio(GENERIC_KEY, await grabYouTube(url, defaultSegment), false);
}

/** Add a Deezer song's 30-second preview to the generic-music pool. */
export async function addGenericDeezer(trackId: number): Promise<AudioRow> {
	const track = await deezer.getTrack(trackId);
	if (!track) throw new Error('Track not found on Deezer');
	const { bytes, mime } = await downloadPreview(trackId);
	const file = writeAudioFile('dz', bytes, mime);
	return storeAudio(
		GENERIC_KEY,
		{
			source: 'deezer',
			deezerTrackId: trackId,
			trackTitle: track.title,
			artist: track.artist,
			file,
			originalName: `deezer-${trackId}`,
			mime,
			bytes: bytes.length,
			duration: Math.min(30, track.duration),
			start: 0,
			segmentEnd: null,
			sourceUrl: null
		},
		false
	);
}

export function isMusicSlot(slot: string): slot is MusicSlot {
	return MUSIC_SLOTS.some((s) => s.id === slot);
}

/** Assign a generic track to a screen (null = the user's own music, the default). */
export function setSlot(slot: MusicSlot, audioId: string | null) {
	if (audioId === null) run('DELETE FROM music_slots WHERE slot = ?', slot);
	else {
		if (!get("SELECT 1 FROM soundtrack_audio WHERE id = ? AND title_key = ?", audioId, GENERIC_KEY)) throw new Error('Not a generic track');
		run('INSERT INTO music_slots (slot, audio_id) VALUES (?, ?) ON CONFLICT(slot) DO UPDATE SET audio_id = excluded.audio_id', slot, audioId);
	}
	invalidateFallback();
}

export function slotAssignments(): Partial<Record<MusicSlot, string>> {
	return Object.fromEntries(all<{ slot: string; audio_id: string }>('SELECT slot, audio_id FROM music_slots').map((r) => [r.slot, r.audio_id]));
}

/** Generic tracks per screen, ready for the music plan (disabled tracks are skipped). */
export function slotTracks(): Partial<Record<MusicSlot, MusicTrack>> {
	const generic = new Map((tracksByTitle(new Set([GENERIC_KEY])).get(GENERIC_KEY) ?? []).map((t) => [t.id, t]));
	const out: Partial<Record<MusicSlot, MusicTrack>> = {};
	for (const [slot, id] of Object.entries(slotAssignments())) {
		const t = generic.get(id as string);
		if (t && isMusicSlot(slot)) out[slot] = t;
	}
	return out;
}

// ------------------------------------------------------------------ sound effects

export function isSfxName(name: string): name is SfxName {
	return SFX_IDS.includes(name);
}

/** Default part of a grabbed/uploaded clip to use as a sound effect. */
export function defaultSfxSegment(duration: number | null): { start: number; end: number | null } {
	if (!duration || duration <= 5) return { start: 0, end: null };
	return { start: 0, end: 2 };
}

/** Replace a sound effect with a YouTube grab (the admin then trims it). */
export async function setSfxFromYouTube(name: SfxName, url: string): Promise<AudioRow> {
	return storeAudio(sfxKey(name), await grabYouTube(url, defaultSfxSegment), true);
}

export const SFX_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Replace a sound effect with an uploaded audio file. The browser reports the decoded
 * duration (there's no ffmpeg on the server) so a long file starts out trimmed.
 */
export function setSfxUpload(name: SfxName, data: Buffer, originalName: string, mimeIn: string, reportedDuration: number | null = null): AudioRow {
	const mime = mimeIn.toLowerCase();
	if (!AUDIO_MIME_TYPES.includes(mime)) throw new Error('Unsupported audio type');
	if (data.length > SFX_MAX_BYTES) throw new Error('File larger than 15 MB');
	if (!looksLikeAudio(data)) throw new Error('File does not look like audio');
	const file = writeAudioFile('sfx', data, mime);
	const duration = reportedDuration !== null && Number.isFinite(reportedDuration) && reportedDuration > 0 ? Math.min(reportedDuration, 3600) : null;
	const seg = defaultSfxSegment(duration);
	return storeAudio(
		sfxKey(name),
		{
			source: 'upload',
			deezerTrackId: null,
			trackTitle: originalName.replace(/\.[^.]+$/, ''),
			artist: null,
			file,
			originalName,
			mime,
			bytes: data.length,
			duration,
			start: seg.start,
			segmentEnd: seg.end,
			sourceUrl: null
		},
		true
	);
}

/** Back to the built-in synthesized sound. */
export function resetSfx(name: SfxName) {
	for (const r of all<AudioRow>('SELECT * FROM soundtrack_audio WHERE title_key = ?', sfxKey(name))) deleteAudio(r.id);
}

/** Replaced sound effects for the player. */
export function customSfx(): Partial<Record<SfxName, CustomSfx>> {
	const out: Partial<Record<SfxName, CustomSfx>> = {};
	for (const r of all<AudioRow>("SELECT * FROM soundtrack_audio WHERE title_key LIKE 'sfx:%' AND enabled = 1")) {
		const name = r.title_key.slice(4);
		if (isSfxName(name)) out[name] = { url: `/audio/t/${r.id}`, start: r.start, end: r.segment_end, gain: r.gain };
	}
	return out;
}

/** Minimum length of a chosen segment (seconds). Short clips are allowed; they loop. */
export const MIN_SEGMENT = 1.5;
/** Sound effects can be much shorter (a pop is a fraction of a second). */
export const MIN_SFX_SEGMENT = 0.05;

/** Choose the part of an audio file to play: [start, end] seconds (end null = to the end). */
export function setSegment(id: string, start: number, end: number | null) {
	const row = audioById(id);
	if (!row) throw new Error('Not found');
	const dur = row.duration ?? Infinity;
	const min = row.title_key.startsWith('sfx:') ? MIN_SFX_SEGMENT : MIN_SEGMENT;
	const st = Math.max(0, Math.min(Number(start) || 0, dur - min));
	let en = end === null || end === undefined || !Number.isFinite(end) ? null : Math.min(Number(end), dur);
	if (en !== null && en >= dur - 0.02) en = null; // "to the end"
	if (en !== null && en - st < min - 1e-6) throw new Error(`The segment must be at least ${min} seconds`);
	run(
		"UPDATE soundtrack_audio SET start = ?, segment_end = ?, start_method = 'manual' WHERE id = ?",
		Math.round(st * 1000) / 1000,
		en === null ? null : Math.round(en * 1000) / 1000,
		id
	);
	invalidateFallback();
}

/** Remove the selected track for a title (theme songs are untouched). */
export function clearSelection(titleKey: string) {
	for (const r of all<AudioRow>("SELECT * FROM soundtrack_audio WHERE title_key = ? AND source <> 'theme'", titleKey)) deleteAudio(r.id);
}

/** Re-download a cached preview whose file went missing (e.g. a restored backup without audio). */
export async function restorePreview(row: AudioRow): Promise<boolean> {
	if (row.source !== 'deezer' || !row.deezer_track_id) return false;
	try {
		const { bytes } = await downloadPreview(row.deezer_track_id);
		fs.mkdirSync(audioDir(), { recursive: true });
		fs.writeFileSync(path.join(audioDir(), row.file), bytes);
		return true;
	} catch {
		return false;
	}
}

/**
 * Bulk helper: give every featured title that has no music yet its most popular track.
 * Sequential to stay well inside Deezer's rate limit.
 */
export async function selectTopTracks(keys: string[]): Promise<{ selected: number; failed: number }> {
	const matches = titleMatches();
	const withMusic = new Set(all<{ title_key: string }>('SELECT DISTINCT title_key FROM soundtrack_audio WHERE enabled = 1').map((r) => r.title_key));
	let selected = 0,
		failed = 0;
	for (const key of keys) {
		const top = matches.get(key)?.tracks[0];
		if (withMusic.has(key) || !top || matches.get(key)?.musicOff) continue;
		try {
			await selectTrack(key, top.id);
			selected++;
		} catch {
			failed++;
		}
	}
	return { selected, failed };
}

export function updateAudio(id: string, patch: { enabled?: boolean; gain?: number }) {
	if (!audioById(id)) throw new Error('Not found');
	if (patch.enabled !== undefined) run('UPDATE soundtrack_audio SET enabled = ? WHERE id = ?', patch.enabled ? 1 : 0, id);
	if (patch.gain !== undefined && Number.isFinite(patch.gain)) run('UPDATE soundtrack_audio SET gain = ? WHERE id = ?', Math.max(0, Math.min(1.5, patch.gain)), id);
	invalidateFallback();
}

export function deleteAudio(id: string) {
	const row = audioById(id);
	if (!row) return;
	run('DELETE FROM soundtrack_audio WHERE id = ?', id);
	run('DELETE FROM music_slots WHERE audio_id = ?', id);
	fs.rmSync(path.join(audioDir(), row.file), { force: true });
	invalidateFallback();
}

// ------------------------------------------------------------------ album covers

/**
 * Album covers are cached through the artwork cache and served from /art/<hash>, so the
 * strict CSP (img-src 'self') holds. Only Deezer's image CDN (or the configured Deezer API
 * host, e.g. a test fake) is fetched — never arbitrary URLs.
 */
export async function localCover(url: string | null | undefined): Promise<string | null> {
	if (!url) return null;
	if (url.startsWith('/art/')) return url;
	try {
		const host = new URL(url).hostname;
		const apiHost = new URL(config().deezer.url).hostname;
		if (!/(^|\.)dzcdn\.net$/.test(host) && host !== apiHost) return null;
	} catch {
		return null;
	}
	return ensureArt({ key: `deezer-cover:${url}`, urls: [url] });
}

export async function withLocalCovers<T extends { cover: string | null }>(albums: T[]): Promise<T[]> {
	return Promise.all(albums.map(async (a) => ({ ...a, cover: await localCover(a.cover) })));
}

/** Remove audio files no longer referenced (e.g. from the retired mood-segment system). */
export function cleanupOrphanAudio() {
	const dir = audioDir();
	if (!fs.existsSync(dir)) return;
	const keep = new Set(all<{ file: string }>('SELECT file FROM soundtrack_audio').map((r) => r.file));
	for (const f of fs.readdirSync(dir)) {
		const fp = path.join(dir, f);
		if (!keep.has(f) && fs.statSync(fp).isFile()) fs.rmSync(fp, { force: true });
	}
}

// ------------------------------------------------------------------ preparation step

export interface RefreshStats {
	titles: number;
	lookedUp: number;
	matched: number;
	themes: number;
	errors: number;
}

/**
 * Called by the preparation runner after reports are built. Never throws: soundtrack
 * problems are reported as warnings and must not fail a preparation.
 */
export async function refreshSoundtracks(
	featured: FeaturedTitle[],
	library: Map<string, { jellyfinIds: string[]; inLibrary: boolean }>,
	log: (m: string) => void,
	progress: (done: number, total: number, phase: string) => void
): Promise<RefreshStats> {
	const stats: RefreshStats = { titles: featured.length, lookedUp: 0, matched: 0, themes: 0, errors: 0 };
	for (const f of featured) upsertTitle(f);
	const matches = titleMatches();

	if (deezer.deezerEnabled()) {
		const due = featured.filter((f) => {
			const m = matches.get(f.key);
			if (!m || m.status === 'pending') return true;
			return (m.status === 'none' || m.status === 'error') && Date.now() - (m.lookedUpAt ?? 0) > RELOOKUP_MS;
		});
		let done = 0;
		let consecutiveErrors = 0;
		for (const f of due) {
			if (consecutiveErrors >= 5) {
				log('Deezer is not responding; skipping remaining soundtrack lookups');
				break;
			}
			try {
				const status = await lookupTitle(f.key);
				stats.lookedUp++;
				if (status === 'auto') stats.matched++;
				consecutiveErrors = 0;
			} catch (e) {
				stats.errors++;
				consecutiveErrors++;
				log(`Soundtrack lookup failed for ${f.title}: ${(e as Error).message}`);
			}
			progress(++done, due.length, `Finding soundtracks (${done}/${due.length})`);
		}
	}

	// Jellyfin theme songs (cached locally so they keep working if the library changes)
	const haveTheme = new Set(all<{ title_key: string }>("SELECT title_key FROM soundtrack_audio WHERE source = 'theme'").map((r) => r.title_key));
	const off = new Set(all<{ title_key: string }>('SELECT title_key FROM soundtrack_titles WHERE music_off = 1').map((r) => r.title_key));
	const candidates = featured.filter((f) => !haveTheme.has(f.key) && !off.has(f.key) && library.get(f.key)?.inLibrary);
	let tdone = 0;
	await mapLimit(candidates, 3, async (f) => {
		const ids = library.get(f.key)?.jellyfinIds ?? [];
		for (const itemId of ids.slice(0, 2)) {
			const songs = await jf.getThemeSongs(itemId).catch(() => []);
			const song = songs[0];
			if (!song?.Id) continue;
			if (get('SELECT 1 FROM soundtrack_audio WHERE jf_item_id = ?', song.Id)) break;
			const audio = await jf.downloadAudio(song.Id);
			if (!audio || !AUDIO_MIME_TYPES.includes(audio.mime)) continue;
			const file = writeAudioFile('theme', audio.bytes, audio.mime);
			run(
				`INSERT INTO soundtrack_audio (id, title_key, source, jf_item_id, track_title, file, original_name, mime, bytes, duration, start, start_method, created_at)
				 VALUES (?, ?, 'theme', ?, ?, ?, ?, ?, ?, ?, 0, 'default', ?)`,
				randomId(12),
				f.key,
				song.Id,
				song.Name ?? 'Theme',
				file,
				song.Name ?? 'theme',
				audio.mime,
				audio.bytes.length,
				jf.ticksToSeconds(song.RunTimeTicks),
				Date.now()
			);
			stats.themes++;
			break;
		}
		progress(++tdone, candidates.length, `Collecting Jellyfin theme songs (${tdone}/${candidates.length})`);
	});
	invalidateFallback();
	return stats;
}

// ------------------------------------------------------------------ player

function toTrack(r: AudioRow, titles: Map<string, string>): MusicTrack {
	const title = titles.get(r.title_key) ?? '';
	const name = r.track_title ? `${r.track_title}${r.artist && r.source !== 'theme' ? ` — ${r.artist}` : ''}` : r.source === 'theme' ? 'Theme' : 'Soundtrack';
	return {
		id: r.id,
		url: `/audio/t/${r.id}`,
		start: r.start,
		end: r.segment_end ?? null,
		gain: r.gain,
		label: title && !name.toLowerCase().includes(title.toLowerCase()) ? `${name} · ${title}` : name,
		titleKey: r.title_key
	};
}

/** Enabled audio per title: the admin's selected track first, then Jellyfin theme songs. */
export function tracksByTitle(keys?: Set<string>): Map<string, MusicTrack[]> {
	const titles = new Map(all<{ title_key: string; title: string }>('SELECT title_key, title FROM soundtrack_titles').map((r) => [r.title_key, r.title]));
	// titles confirmed as "no music" contribute nothing (not even their theme song)
	const rows = all<AudioRow>(
		`SELECT a.* FROM soundtrack_audio a LEFT JOIN soundtrack_titles t ON t.title_key = a.title_key
		 WHERE a.enabled = 1 AND COALESCE(t.music_off, 0) = 0
		 ORDER BY CASE a.source WHEN 'theme' THEN 1 ELSE 0 END, a.created_at DESC`
	);
	const out = new Map<string, MusicTrack[]>();
	for (const r of rows) {
		if (keys && !keys.has(r.title_key)) continue;
		let l = out.get(r.title_key);
		if (!l) out.set(r.title_key, (l = []));
		l.push(toTrack(r, titles));
	}
	return out;
}

let fallbackCache: { year: number; datasetId: number; tracks: MusicTrack[] } | null = null;
function invalidateFallback() {
	fallbackCache = null;
}

/** Server-wide music for users none of whose titles have music: the most-featured titles first. */
export function fallbackTracks(year: number): MusicTrack[] {
	const ds = activeDataset(year);
	if (!ds) return [];
	if (fallbackCache && fallbackCache.year === year && fallbackCache.datasetId === ds.id) return fallbackCache.tracks;
	const byTitle = tracksByTitle();
	const tracks = featuredTitles(reportsForYear(year))
		.map((f) => byTitle.get(f.key)?.[0])
		.filter((t): t is MusicTrack => Boolean(t))
		.slice(0, 3);
	fallbackCache = { year, datasetId: ds.id, tracks };
	return tracks;
}

/** The music plan for one user's report (only their own titles + anonymous fallback). */
export function musicFor(report: WrappedReport): MusicPlan {
	const keys = new Set(report.slides.flatMap(slideTitleKeys));
	return buildMusicPlan(report, tracksByTitle(keys), fallbackTracks(report.year), slotTracks());
}
