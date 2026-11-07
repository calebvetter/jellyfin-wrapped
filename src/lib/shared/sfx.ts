/** Sound effects used by the story. Each is synthesized by default; admins can replace it. */
export const SFX = [
	{ id: 'whoosh', label: 'Whoosh', when: 'Every slide transition' },
	{ id: 'pop', label: 'Pop', when: 'Stickers, cards and list items popping in' },
	{ id: 'tick', label: 'Tick', when: 'Numbers counting up (plays rapidly)' },
	{ id: 'reveal', label: 'Reveal', when: 'Big reveals: #1 show/movie, personality, top genre' },
	{ id: 'sparkle', label: 'Sparkle', when: 'Shimmering moments: genre helix, clock, streak' },
	{ id: 'stamp', label: 'Stamp', when: 'Stamps slamming down (“Hidden gem”, “Good taste”, “Respect”)' },
	{ id: 'thud', label: 'Thud', when: 'The busiest-day calendar landing' },
	{ id: 'drumroll', label: 'Drumroll', when: 'Build-up before the #1s and the personality reveal (~3 s)' }
] as const;

export type SfxName = (typeof SFX)[number]['id'];

export const SFX_IDS: readonly string[] = SFX.map((s) => s.id);

/** Title key used for a replaced sound effect in soundtrack_audio. */
export const sfxKey = (name: SfxName) => `sfx:${name}`;

/** Custom sound effect as delivered to the player. */
export interface CustomSfx {
	url: string;
	start: number;
	end: number | null;
	gain: number;
}
