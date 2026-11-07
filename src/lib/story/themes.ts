import type { SlideKind } from '$shared/report';

/** Per-slide colour identity: background, foreground, and the glow used around the desktop frame. */
export const THEMES: Record<SlideKind | 'outro', { bg: string; fg: string; glow: string }> = {
	intro: { bg: '#0b0614', fg: '#ffffff', glow: '#6a1cf6' },
	'total-time': { bg: '#c6f432', fg: '#0b0614', glow: '#c6f432' },
	'top-shows': { bg: '#4b12d6', fg: '#ffffff', glow: '#6a1cf6' },
	'top-movies': { bg: '#fff1dc', fg: '#14080a', glow: '#ff2d3d' },
	genres: { bg: '#0b0614', fg: '#ffffff', glow: '#2de2e6' },
	actor: { bg: '#ff6a13', fg: '#14080a', glow: '#ff6a13' },
	binge: { bg: '#2448ff', fg: '#ffffff', glow: '#2448ff' },
	clock: { bg: '#08123d', fg: '#ffffff', glow: '#2de2e6' },
	'busiest-day': { bg: '#ff3ea5', fg: '#14080a', glow: '#ff3ea5' },
	streak: { bg: '#062e23', fg: '#ffffff', glow: '#ff6a13' },
	original: { bg: '#ffe14d', fg: '#14080a', glow: '#ffe14d' },
	requests: { bg: '#c9b6ff', fg: '#1a0a4a', glow: '#c9b6ff' },
	personality: { bg: '#0b0614', fg: '#ffffff', glow: '#ff3ea5' },
	summary: { bg: '#0b0614', fg: '#ffffff', glow: '#c6f432' },
	outro: { bg: '#0b0614', fg: '#ffffff', glow: '#ff3ea5' }
};
