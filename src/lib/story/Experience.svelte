<script lang="ts">
	import Story from './Story.svelte';
	import type { WrappedReport } from '$shared/report';
	import type { MusicPlan } from '$shared/music';
	import type { CustomSfx, SfxName } from '$shared/sfx';

	interface Props {
		report: WrappedReport | null;
		state: 'ready' | 'not-enough' | 'not-prepared';
		userName: string;
		year: number | null;
		years: number[];
		music: MusicPlan;
		customSfx?: Partial<Record<SfxName, CustomSfx>>;
		sfxEnabled: boolean;
		trackingToken: string | null;
		preview?: boolean;
		badge?: string | null;
		showSignOut?: boolean;
		yearLinkBase?: string;
	}

	let { report, state, userName, year, years, music, customSfx = {}, sfxEnabled, trackingToken, preview = false, badge = null, showSignOut = false, yearLinkBase = '' }: Props = $props();
</script>

{#if report}
	{#key report.year}
		<Story {report} {music} {customSfx} {sfxEnabled} {trackingToken} {preview} {badge} />
	{/key}
	{#if years.length > 1}
		<nav class="years" aria-label="Choose a year">
			{#each years as y}
				<a href="{yearLinkBase}?year={y}" data-sveltekit-reload aria-current={y === year ? 'page' : undefined}>{y}</a>
			{/each}
		</nav>
	{/if}
{:else}
	<main class="empty">
		<div class="card">
			<div class="blob" aria-hidden="true"></div>
			<p class="kicker">Hey {userName},</p>
			{#if state === 'not-enough'}
				<h1>Not much to wrap… yet.</h1>
				<p>We couldn't find enough viewing{year ? ` in ${year}` : ''} to put together your Wrapped. Press play on something good and check back next time.</p>
			{:else}
				<h1>Your Wrapped is still in the oven.</h1>
				<p>Your server admin hasn't prepared this year's Wrapped yet. Check back soon — it'll be worth the wait.</p>
			{/if}
			{#if showSignOut}
				<form method="POST" action="/logout"><button>Sign out</button></form>
			{/if}
		</div>
	</main>
{/if}

<style>
	.years {
		position: fixed;
		z-index: 5;
		left: 50%;
		bottom: 34px;
		transform: translateX(-50%);
		display: none;
		gap: 6px;
		padding: 6px;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.06);
		backdrop-filter: blur(10px);
	}

	@media (min-width: 900px) {
		.years {
			display: flex;
		}
	}

	.years a {
		padding: 6px 12px;
		border-radius: 99px;
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		font-size: 13px;
		font-weight: 700;
	}

	.years a[aria-current='page'] {
		background: var(--lime);
		color: var(--ink);
	}

	.empty {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: radial-gradient(80% 60% at 70% 10%, #3a0f9e, transparent 60%), var(--ink);
	}

	.card {
		position: relative;
		max-width: 440px;
		overflow: hidden;
	}

	.blob {
		position: absolute;
		right: -40px;
		top: -40px;
		width: 140px;
		height: 140px;
		border-radius: 50%;
		background: var(--pink);
		opacity: 0.8;
		filter: blur(2px);
	}

	.kicker {
		position: relative;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 28px;
		margin: 0;
		color: var(--lime);
	}

	h1 {
		position: relative;
		margin: 8px 0 16px;
		font-family: var(--font-display);
		font-weight: 800;
		font-stretch: 75%;
		text-transform: uppercase;
		font-size: 52px;
		line-height: 0.9;
	}

	p {
		position: relative;
		font-size: 17px;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.8);
	}

	button {
		margin-top: 12px;
		padding: 10px 18px;
		border-radius: 99px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		background: none;
		cursor: pointer;
	}
</style>
