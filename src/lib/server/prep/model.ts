/** Internal data model used between metadata resolution, normalization and aggregation. */
import type { Interval } from './time';
import type { ArtSource } from '../artwork';

export type MediaKind = 'movie' | 'episode';

export interface CastMember {
	key: string; // normalized identity key (tmdb person id or name)
	name: string;
	character: string | null;
	portrait: ArtSource | null;
	order: number;
}

/** A watchable "title": a movie or a series. */
export interface TitleMeta {
	key: string; // "movie:tmdb:603" | "movie:jf:<id>" | "series:tmdb:1399" | "series:jf:<id>"
	kind: 'movie' | 'series';
	title: string;
	year: number | null;
	genres: string[];
	cast: CastMember[];
	popularity: number | null; // TMDb popularity
	tmdbId: number | null;
	poster: ArtSource | null;
	backdrop: ArtSource | null;
	/** Episode counts per season number (series only), used for season completion. */
	seasonEpisodes: Record<number, number> | null;
	jellyfinIds: string[];
	missingFromLibrary: boolean;
}

/** Per Jellyfin item (movie or episode) resolution. */
export interface ItemMeta {
	id: string; // jellyfin item id
	kind: MediaKind | 'other';
	titleKey: string; // TitleMeta.key
	/** Stable identity for this playable unit across library re-adds. */
	unitKey: string; // movie => titleKey, episode => `${titleKey}:s1e2` or `${titleKey}:ep:<id>`
	name: string;
	runtimeSec: number | null;
	season: number | null;
	episode: number | null;
}

/** One cleaned playback row (Jellystat), mapped onto resolved metadata. */
export interface PlaybackRecord {
	id: string;
	userId: string;
	kind: MediaKind;
	unitKey: string;
	titleKey: string;
	season: number | null;
	episode: number | null;
	start: number; // UTC ms
	end: number; // UTC ms
	seconds: number; // watched seconds (pauses excluded by Jellystat)
	runtimeSec: number | null;
}

/** A logical "view": one or more resumed sessions of the same unit merged together. */
export interface View {
	userId: string;
	kind: MediaKind;
	unitKey: string;
	titleKey: string;
	season: number | null;
	episode: number | null;
	start: number;
	end: number;
	seconds: number;
	segments: Interval[];
	runtimeSec: number | null;
	completed: boolean;
	rewatch: boolean;
}
