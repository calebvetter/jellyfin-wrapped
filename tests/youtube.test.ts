import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalUrl, parseYouTubeId } from '../src/lib/server/integrations/youtube';
import { openDatabase, _setDbForTests, run, get } from '../src/lib/server/db';
import { defaultSegment, selectTopTracks, setMusicOff, setSegment, tracksByTitle } from '../src/lib/server/soundtrack';

describe('YouTube links', () => {
	it('extracts the video id from every common link form', () => {
		const id = 'dQw4w9WgXcQ';
		for (const url of [
			`https://www.youtube.com/watch?v=${id}`,
			`https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
			`https://m.youtube.com/watch?v=${id}`,
			`https://music.youtube.com/watch?v=${id}&si=abc`,
			`https://youtu.be/${id}?t=5`,
			`https://www.youtube.com/shorts/${id}`,
			`https://www.youtube.com/embed/${id}`,
			`https://www.youtube.com/live/${id}`,
			`https://www.youtube-nocookie.com/embed/${id}`,
			`youtu.be/${id}`,
			id
		]) {
			expect(parseYouTubeId(url), url).toBe(id);
		}
	});

	it('rejects non-YouTube and malformed links (nothing arbitrary reaches yt-dlp)', () => {
		for (const bad of ['https://vimeo.com/12345', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ--extra', '--exec rm', '']) {
			expect(parseYouTubeId(bad), bad).toBeNull();
		}
		expect(canonicalUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	});
});

describe('audio segments', () => {
	beforeEach(() => {
		_setDbForTests(openDatabase(':memory:'));
		run("INSERT INTO soundtrack_titles (title_key, title, kind, status, updated_at) VALUES ('series:tmdb:1', 'Show', 'series', 'auto', 0)");
		run(
			`INSERT INTO soundtrack_audio (id, title_key, source, file, mime, bytes, duration, start, created_at)
			 VALUES ('clip11', 'series:tmdb:1', 'youtube', 'x.m4a', 'audio/mp4', 1, 11, 0, 0),
			        ('song', 'series:tmdb:1', 'theme', 'y.m4a', 'audio/mp4', 1, 200, 0, 0)`
		);
	});

	it('plays short grabs whole and gives long ones a 30 s default segment', () => {
		expect(defaultSegment(11)).toEqual({ start: 0, end: null });
		expect(defaultSegment(30)).toEqual({ start: 0, end: null });
		expect(defaultSegment(245)).toEqual({ start: 0, end: 30 });
	});

	it('accepts any segment of an 11-second clip down to 1.5 s', () => {
		setSegment('clip11', 2.25, 9.5);
		expect(get('SELECT start, segment_end FROM soundtrack_audio WHERE id = ?', 'clip11')).toEqual({ start: 2.25, segment_end: 9.5 });
		setSegment('clip11', 0, 11); // whole clip → stored as "to the end"
		expect(get<{ segment_end: number | null }>('SELECT segment_end FROM soundtrack_audio WHERE id = ?', 'clip11')?.segment_end).toBeNull();
		expect(() => setSegment('clip11', 5, 6)).toThrow(/at least/);
	});

	it('clamps out-of-range times', () => {
		setSegment('clip11', -4, 99);
		expect(get('SELECT start, segment_end FROM soundtrack_audio WHERE id = ?', 'clip11')).toEqual({ start: 0, segment_end: null });
	});

	it('"no music" silences a title (theme song included) and is skipped by the bulk pick', async () => {
		expect(tracksByTitle().get('series:tmdb:1')?.length).toBe(2);
		setMusicOff('series:tmdb:1', true);
		expect(tracksByTitle().get('series:tmdb:1')).toBeUndefined();
		// the picked track is removed, the theme song is kept (but ignored)
		expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM soundtrack_audio WHERE source <> 'theme'")?.n).toBe(0);
		run(`UPDATE soundtrack_titles SET tracks = '[{"id":5,"title":"Hit","artist":"X","duration":200,"rank":9,"position":1}]'`);
		expect(await selectTopTracks(['series:tmdb:1'])).toEqual({ selected: 0, failed: 0 });
		setMusicOff('series:tmdb:1', false);
		expect(tracksByTitle().get('series:tmdb:1')?.map((t) => t.id)).toEqual(['song']);
	});

	it('passes the segment to the player', () => {
		setSegment('song', 61, 83.5);
		const t = tracksByTitle().get('series:tmdb:1')!.find((x) => x.id === 'song')!;
		expect([t.start, t.end]).toEqual([61, 83.5]);
	});
});
