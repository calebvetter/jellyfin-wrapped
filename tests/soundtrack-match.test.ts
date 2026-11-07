import { describe, expect, it } from 'vitest';
import { MIN_ALBUM_SCORE, normTitle, scoreAlbum } from '../src/lib/server/integrations/deezer';

const score = (title: string, film: string, kind: 'movie' | 'series' = 'movie', recordType = 'album', nbTracks = 20) =>
	scoreAlbum({ title, recordType, nbTracks }, film, kind);

describe('soundtrack album matching', () => {
	it('normalizes titles', () => {
		expect(normTitle('Pokémon: The First Movie & More')).toBe('pokemon the first movie and more');
	});

	it('accepts the real soundtrack and prefers it over look-alikes', () => {
		const real = score('Interstellar (Original Motion Picture Soundtrack) (Expanded Edition)', 'Interstellar');
		expect(real).toBeGreaterThanOrEqual(MIN_ALBUM_SCORE);
		expect(score('Interstellar Prime (Original Game Soundtrack)', 'Interstellar')).toBeLessThan(real);
		expect(score('Interstellar Piano Covers', 'Interstellar')).toBeLessThan(MIN_ALBUM_SCORE);
	});

	it('requires the title as whole words (short titles)', () => {
		expect(score('Up (Original Motion Picture Soundtrack)', 'Up')).toBeGreaterThan(score('Blow-Up (Original Motion Picture Soundtrack)', 'Up'));
		expect(score('Upside Down', 'Up')).toBe(-1);
	});

	it('likes series wording for shows', () => {
		const s = score('Severance: Season 1 (Apple TV+ Original Series Soundtrack)', 'Severance', 'series');
		expect(s).toBeGreaterThanOrEqual(MIN_ALBUM_SCORE);
	});

	it('treats a leading "The" as optional', () => {
		expect(score('Aristocats (Original Soundtrack)', 'The Aristocats')).toBeGreaterThanOrEqual(MIN_ALBUM_SCORE);
	});

	it('rejects tribute / karaoke / lullaby albums', () => {
		for (const t of ['Stranger Things (Lullaby Versions)', 'Stranger Things Karaoke', 'A Tribute to Stranger Things']) {
			expect(score(t, 'Stranger Things', 'series')).toBeLessThan(MIN_ALBUM_SCORE);
		}
	});
});
