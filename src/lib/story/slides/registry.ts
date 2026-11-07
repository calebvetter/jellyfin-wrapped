import type { Component } from 'svelte';
import type { SlideKind } from '$shared/report';
import Intro from './Intro.svelte';
import TotalTime from './TotalTime.svelte';
import TopShows from './TopShows.svelte';
import TopMovies from './TopMovies.svelte';
import Genres from './Genres.svelte';
import Actor from './Actor.svelte';
import Binge from './Binge.svelte';
import Clock from './Clock.svelte';
import BusiestDay from './BusiestDay.svelte';
import Streak from './Streak.svelte';
import Original from './Original.svelte';
import Requests from './Requests.svelte';
import Personality from './Personality.svelte';
import Summary from './Summary.svelte';

/** Slide kind → component. Add new slide types here (and to SLIDE_ORDER in $shared/report). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SLIDES: Record<SlideKind, Component<{ slide: any }>> = {
	intro: Intro,
	'total-time': TotalTime,
	'top-shows': TopShows,
	'top-movies': TopMovies,
	genres: Genres,
	actor: Actor,
	binge: Binge,
	clock: Clock,
	'busiest-day': BusiestDay,
	streak: Streak,
	original: Original,
	requests: Requests,
	personality: Personality,
	summary: Summary
};
