/** Music plan types shared by the server (plan builder) and the player. */

export interface MusicTrack {
	id: string;
	url: string;
	start: number; // seconds: the best section to start from
	end: number | null; // seconds: end of the chosen segment (null = end of file); segments loop
	gain: number;
	label: string; // "Cornfield Chase — Hans Zimmer · Interstellar"
	titleKey: string;
}

export interface MusicPlan {
	tracks: MusicTrack[];
	/** Track id per slide index (report slides + the outro), or null for silence. */
	plan: (string | null)[];
}

/**
 * Screens that aren't really about one movie or show. An admin can assign a "generic"
 * track to each; unassigned screens use the user's own music as before.
 */
export const MUSIC_SLOTS = [
	{ id: 'intro', label: 'Intro', hint: 'Opens the story' },
	{ id: 'total-time', label: 'Total watch time', hint: 'The big numbers' },
	{ id: 'clock', label: 'Viewing time personality', hint: 'Around-the-clock chart' },
	{ id: 'streak', label: 'Longest streak', hint: 'Days in a row' },
	{ id: 'personality', label: 'Watching personality', hint: 'The big reveal' },
	{ id: 'summary', label: 'Year in review & Rewatch', hint: 'The finale' },
	{ id: 'fallback', label: 'Users with no music of their own', hint: "Plays throughout when none of a user's titles has music" }
] as const;

export type MusicSlot = (typeof MUSIC_SLOTS)[number]['id'];

/** Title key used for generic tracks in soundtrack_audio. */
export const GENERIC_KEY = 'generic';
