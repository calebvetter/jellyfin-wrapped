<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';

	let { data, form } = $props();
	let pending = $state(false);
	let root: HTMLElement;

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const c = gsap.context(() => {
			gsap.from('.word > span', { yPercent: 110, duration: 1, stagger: 0.08, ease: 'expo.out' });
			gsap.from('.shape', { scale: 0, rotate: -90, duration: 1.4, stagger: 0.12, ease: 'elastic.out(1, 0.6)' });
			gsap.from('.panel', { y: 40, opacity: 0, duration: 0.8, delay: 0.4, ease: 'power3.out' });
			gsap.to('.shape.star', { rotate: '+=360', duration: 40, repeat: -1, ease: 'none', delay: 1.4 });
		}, root);
		return () => c.revert();
	});
</script>

<svelte:head><title>Jellyfin Wrapped — Sign in</title></svelte:head>

<main class="login" bind:this={root}>
	<div class="art" aria-hidden="true">
		<svg class="shape star" viewBox="0 0 200 200"><path d="M100 0l14 46 41-26-17 45 48-3-38 30 42 24-48 6 26 41-45-17 3 48-30-38-24 42-6-48-41 26 17-45-48 3 38-30-42-24 48-6-26-41 45 17-3-48 30 38z" fill="#c6f432" /></svg>
		<div class="shape dot"></div>
		<div class="shape ring"></div>
		<h1 class="display">
			<span class="word"><span>Your</span></span>
			<span class="word"><span>year</span></span>
			<span class="word outline"><span>on</span></span>
			<span class="word pink"><span>screen.</span></span>
		</h1>
	</div>

	<section class="panel" aria-labelledby="signin">
		<p class="brand">Jellyfin Wrapped</p>
		<h2 id="signin">Sign in with your Jellyfin account</h2>
		<form
			method="POST"
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					await update({ reset: false });
					pending = false;
				};
			}}
		>
			<label>
				<span>Username</span>
				<input name="username" autocomplete="username" required value={form?.username ?? ''} autocapitalize="none" spellcheck="false" />
			</label>
			<label>
				<span>Password</span>
				<input name="password" type="password" autocomplete="current-password" />
			</label>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			{#if !data.configured}<p class="error">Jellyfin isn't configured yet — set JELLYFIN_URL and JELLYFIN_API_KEY.</p>{/if}
			<button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Unwrap my year →'}</button>
		</form>
		<p class="fine">Your password goes straight to your Jellyfin server and is never stored.</p>
		{#if data.mockPreview}<a class="mock" href="/preview">Preview with mock data</a>{/if}
	</section>
</main>

<style>
	.login {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: 1fr;
		background: radial-gradient(90% 70% at 85% 0%, #3a0f9e 0%, transparent 60%), radial-gradient(70% 60% at 0% 100%, #5b0f3f 0%, transparent 70%), var(--ink);
		overflow: hidden;
	}

	@media (min-width: 900px) {
		.login {
			grid-template-columns: 1.2fr 1fr;
			align-items: center;
		}
	}

	.art {
		position: relative;
		padding: 48px 24px 0;
		min-height: 300px;
	}

	@media (min-width: 900px) {
		.art {
			padding: 0 0 0 7vw;
			min-height: 0;
		}
	}

	.shape {
		position: absolute;
		pointer-events: none;
	}

	.star {
		width: min(42vw, 360px);
		right: -6vw;
		top: -4vw;
		opacity: 0.9;
	}

	.dot {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: var(--pink);
		left: 55%;
		bottom: -10px;
	}

	.ring {
		width: 70px;
		height: 70px;
		border: 14px solid var(--cyan);
		border-radius: 50%;
		left: 8%;
		top: 20px;
	}

	h1 {
		position: relative;
		margin: 0;
		font-size: clamp(64px, 13vw, 190px);
	}

	.word {
		display: block;
		overflow: hidden;
	}

	.word > span {
		display: block;
	}

	/* see Intro.svelte: paint-order hides overlapping variable-font contours */
	.outline {
		color: #120821;
		-webkit-text-stroke: 6px #fff;
		paint-order: stroke fill;
		letter-spacing: 0.015em;
	}

	.pink {
		color: var(--lime);
	}

	.panel {
		position: relative;
		margin: 24px;
		padding: 32px 28px;
		border-radius: 28px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		max-width: 440px;
	}

	@media (min-width: 900px) {
		.panel {
			margin: 0 7vw 0 0;
			justify-self: end;
			width: 100%;
		}
	}

	.brand {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		font-size: 13px;
		color: var(--lime);
	}

	h2 {
		margin: 8px 0 24px;
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.05;
	}

	form {
		display: grid;
		gap: 14px;
	}

	label span {
		display: block;
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	input {
		width: 100%;
		padding: 14px 16px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(0, 0, 0, 0.3);
		color: #fff;
		font: inherit;
		font-size: 16px;
	}

	input:focus {
		outline: none;
		border-color: var(--lime);
		box-shadow: 0 0 0 3px rgba(198, 244, 50, 0.25);
	}

	button {
		margin-top: 6px;
		padding: 16px;
		border: 0;
		border-radius: 99px;
		background: var(--lime);
		color: var(--ink);
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 18px;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.error {
		margin: 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: rgba(255, 45, 61, 0.15);
		color: #ffb3b9;
		font-size: 14px;
	}

	.fine {
		margin: 18px 0 0;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.5);
	}

	.mock {
		display: inline-block;
		margin-top: 10px;
		font-size: 13px;
		color: var(--cyan);
	}
</style>
