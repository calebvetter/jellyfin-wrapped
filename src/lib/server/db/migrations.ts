/** Append-only list of schema migrations. Never edit an entry once shipped. */
export const MIGRATIONS: string[] = [
	/* 1: initial schema */ `
	CREATE TABLE settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	-- Browser sessions for Jellyfin-authenticated users. Only a SHA-256 of the cookie value is stored.
	CREATE TABLE sessions (
		id_hash TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		user_name TEXT NOT NULL,
		is_admin INTEGER NOT NULL DEFAULT 0,
		jf_token_enc TEXT,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL,
		verified_at INTEGER NOT NULL
	);
	CREATE INDEX sessions_user ON sessions(user_id);

	-- Snapshot of Jellyfin users captured during preparation / admin refresh.
	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		is_admin INTEGER NOT NULL DEFAULT 0,
		is_disabled INTEGER NOT NULL DEFAULT 0,
		image_tag TEXT,
		last_activity TEXT,
		synced_at INTEGER NOT NULL
	);

	-- One row per preparation run. A run builds a brand-new dataset; only on success is it
	-- swapped in as the active dataset for its year (atomic replace).
	CREATE TABLE datasets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		year INTEGER NOT NULL,
		status TEXT NOT NULL,          -- running | ready | failed | superseded | cancelled
		started_at INTEGER NOT NULL,
		finished_at INTEGER,
		range_start INTEGER NOT NULL,
		range_end INTEGER NOT NULL,
		timezone TEXT NOT NULL,
		started_by TEXT,
		progress TEXT,                 -- JSON progress snapshot
		completeness TEXT,             -- JSON data completeness summary
		cue_sheet TEXT,                -- JSON soundtrack cue sheet derived from the dataset
		log TEXT,                      -- JSON array of log lines (bounded)
		error TEXT
	);
	CREATE INDEX datasets_year ON datasets(year, status);

	CREATE TABLE active_datasets (
		year INTEGER PRIMARY KEY,
		dataset_id INTEGER NOT NULL REFERENCES datasets(id),
		activated_at INTEGER NOT NULL
	);

	-- Ready-to-play reports (JSON) per user for a dataset.
	CREATE TABLE reports (
		dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL,
		user_name TEXT NOT NULL,
		slide_count INTEGER NOT NULL,
		minutes INTEGER NOT NULL,
		report TEXT NOT NULL,
		stats TEXT NOT NULL,           -- JSON: full statistics for admin inspection
		PRIMARY KEY (dataset_id, user_id)
	);

	-- Persistent metadata cache. Survives library deletions so historical stats keep titles/art.
	CREATE TABLE media_cache (
		key TEXT PRIMARY KEY,          -- 'jf:<itemId>' | 'tmdb:movie:<id>' | 'tmdb:tv:<id>' | 'person:<key>'
		data TEXT NOT NULL,
		source TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);

	-- Locally cached artwork (posters, backdrops, portraits).
	CREATE TABLE artwork (
		hash TEXT PRIMARY KEY,         -- sha256(source key)
		source TEXT NOT NULL,
		file TEXT,
		mime TEXT,
		bytes INTEGER,
		status TEXT NOT NULL,          -- ok | missing
		created_at INTEGER NOT NULL
	);

	-- Passwordless personal links (bearer credentials). Only a hash is used for lookup;
	-- the token itself is stored encrypted (AES-256-GCM) so admins can copy it again.
	CREATE TABLE links (
		id TEXT PRIMARY KEY,
		token_hash TEXT NOT NULL UNIQUE,
		token_enc TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		created_by TEXT,
		revoked_at INTEGER,
		last_used_at INTEGER,
		use_count INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX links_user ON links(user_id);

	-- Engagement analytics: one row per experience visit.
	CREATE TABLE view_visits (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		year INTEGER NOT NULL,
		mode TEXT NOT NULL,            -- login | link
		session_key TEXT NOT NULL,     -- hashed per-tab session id (reloads stay one session)
		device_key TEXT NOT NULL,      -- hashed per-browser id
		started_at INTEGER NOT NULL,
		last_seen_at INTEGER NOT NULL,
		slide_count INTEGER NOT NULL,
		furthest_index INTEGER NOT NULL DEFAULT 0,
		completed INTEGER NOT NULL DEFAULT 0,
		rewatches INTEGER NOT NULL DEFAULT 0,
		active_ms INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX view_visits_user ON view_visits(user_id, year);

	CREATE TABLE view_slides (
		visit_id TEXT NOT NULL REFERENCES view_visits(id) ON DELETE CASCADE,
		slide_id TEXT NOT NULL,
		slide_index INTEGER NOT NULL,
		enters INTEGER NOT NULL DEFAULT 0,
		dwell_ms INTEGER NOT NULL DEFAULT 0,
		skips INTEGER NOT NULL DEFAULT 0,
		revisits INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (visit_id, slide_id)
	);

	-- Admin-supplied soundtrack audio assigned to cue segments.
	CREATE TABLE audio_tracks (
		segment_id TEXT PRIMARY KEY,
		file TEXT NOT NULL,
		original_name TEXT NOT NULL,
		mime TEXT NOT NULL,
		bytes INTEGER NOT NULL,
		gain REAL NOT NULL DEFAULT 1.0,
		start_offset REAL NOT NULL DEFAULT 0,
		uploaded_at INTEGER NOT NULL,
		version INTEGER NOT NULL DEFAULT 1
	);
	`,
	/* 2: soundtracks come from the movies/shows people watched (replaces mood segments) */ `
	DROP TABLE IF EXISTS audio_tracks;

	-- Soundtrack match per title (title keys are the same keys used in reports).
	CREATE TABLE soundtrack_titles (
		title_key TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		kind TEXT NOT NULL,
		year INTEGER,
		status TEXT NOT NULL DEFAULT 'pending', -- pending | auto | confirmed | none | error
		album TEXT,                             -- JSON: chosen Deezer album
		candidates TEXT,                        -- JSON: other Deezer albums to choose from
		tracks TEXT,                            -- JSON: album tracks ordered by popularity
		looked_up_at INTEGER,
		updated_at INTEGER NOT NULL
	);

	-- Playable audio for a title: admin uploads and cached Jellyfin theme songs.
	CREATE TABLE soundtrack_audio (
		id TEXT PRIMARY KEY,
		title_key TEXT NOT NULL,
		source TEXT NOT NULL,                   -- upload | theme
		deezer_track_id INTEGER,
		jf_item_id TEXT,
		track_title TEXT,
		artist TEXT,
		file TEXT NOT NULL,
		original_name TEXT,
		mime TEXT NOT NULL,
		bytes INTEGER NOT NULL,
		duration REAL,
		start REAL NOT NULL DEFAULT 0,          -- where playback begins (the best section)
		start_method TEXT NOT NULL DEFAULT 'default', -- preview | energy | manual | default
		confidence REAL,
		envelope TEXT,                          -- JSON: downsampled loudness for the admin waveform
		gain REAL NOT NULL DEFAULT 0.9,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX soundtrack_audio_title ON soundtrack_audio(title_key);
	`,
	/* 3: audio segments (start → segment_end) and YouTube sources */ `
	ALTER TABLE soundtrack_audio ADD COLUMN segment_end REAL;  -- NULL = play to the end of the file
	ALTER TABLE soundtrack_audio ADD COLUMN source_url TEXT;   -- e.g. the YouTube video URL
	`,
	/* 4: admin decided a title gets no music of its own */ `
	ALTER TABLE soundtrack_titles ADD COLUMN music_off INTEGER NOT NULL DEFAULT 0;
	`,
	/* 5: per-user inclusion in preparation; generic-music slot assignments */ `
	ALTER TABLE users ADD COLUMN included INTEGER NOT NULL DEFAULT 1;

	-- Which generic track (soundtrack_audio with title_key 'generic') plays on screens that
	-- aren't about one title (intro, total-time, clock, streak, personality, summary, fallback).
	CREATE TABLE music_slots (
		slot TEXT PRIMARY KEY,
		audio_id TEXT NOT NULL
	);
	`
];
