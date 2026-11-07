/** Story timing, shared by the player and the server. */
import type { SlideKind } from './report';

/**
 * Seconds each slide is on screen before auto-advancing. Each value is the time its intro
 * animation needs plus ~8–12 s to actually read the content (more for dense slides).
 */
export const SLIDE_DURATION: Record<SlideKind | 'outro', number> = {
	intro: 8, // kinetic title, little to read
	'total-time': 14, // counter finishes ~5 s, then days + stickers + comparison
	'top-shows': 21, // countdown + reveal end ~9 s, then the full top-5 list
	'top-movies': 21, // curtains open ~7 s, then the ticket list
	genres: 16, // helix + dominant genre, then an 8-row legend
	actor: 15, // portrait/name ~4 s, then copy + title fan + runners-up
	binge: 15, // episode tiles land ~5 s, then dates and times
	clock: 15, // dial ~4 s, then persona + explanation
	'busiest-day': 14, // calendar ~3.5 s, then titles watched that day
	streak: 14, // heat grid ignites ~3.7 s, then dates and totals
	original: 16, // stamp + popularity meter ~5 s, then the comparison copy
	requests: 17, // two acts: posters land by ~2.6 s, Good Taste reveal ~3–5 s, then reading time
	personality: 21, // drumroll + flip ~5.5 s, then a paragraph of explanation
	summary: 22, // the whole year on one card
	outro: 0 // waits for the viewer (Rewatch)
};
