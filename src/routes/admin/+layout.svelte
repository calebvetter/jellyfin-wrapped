<script lang="ts">
	import '$lib/admin/admin.css';
	import { page } from '$app/state';

	let { data, children } = $props();

	const nav = [
		{ href: '/admin', label: 'Preparation', icon: 'M4 12h4l3-8 4 16 3-8h2' },
		{ href: '/admin/users', label: 'Users', icon: 'M16 19a4 4 0 00-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM20 19a3 3 0 00-3-3M17 5a3 3 0 010 6' },
		{ href: '/admin/analytics', label: 'Engagement', icon: 'M5 19V10M12 19V5M19 19v-7' },
		{ href: '/admin/soundtrack', label: 'Soundtrack', icon: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z' },
		{ href: '/admin/sound-effects', label: 'Sound effects', icon: 'M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11' }
	];
	const active = (href: string) => (href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href));
</script>

<div class="admin shell">
	<aside class="side">
		<a class="logo" href="/admin">
			<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 22c10-12 26-12 36 0-4 2-6 6-6 10s2 8 6 10c-10 12-26 12-36 0 4-2 6-6 6-10s-2-8-6-10z" fill="#c6f432" /><circle cx="32" cy="32" r="7" fill="#ff3ea5" /></svg>
			<span>Wrapped<small>Admin</small></span>
		</a>
		<nav aria-label="Admin">
			{#each nav as item}
				<a href={item.href} aria-current={active(item.href) ? 'page' : undefined}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg>
					{item.label}
				</a>
			{/each}
		</nav>
		<div class="side-foot">
			<a class="btn small" href="/wrapped">My Wrapped</a>
			{#if data.mockPreview}<a class="btn small" href="/preview">Mock preview</a>{/if}
			<form method="POST" action="/logout"><button class="btn small">Sign out</button></form>
			<p class="muted who">Signed in as <strong>{data.user.name}</strong></p>
		</div>
	</aside>

	<main class="main">
		{#if data.problems.length}
			<div class="alert" style="margin-bottom:20px">
				<strong>Configuration:</strong>
				{data.problems.join(' · ')}
			</div>
		{/if}
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: 1fr;
	}

	@media (min-width: 960px) {
		.shell {
			grid-template-columns: 240px 1fr;
		}
	}

	.side {
		padding: 20px 16px;
		border-bottom: 1px solid var(--line);
		background: #0a0810;
	}

	@media (min-width: 960px) {
		.side {
			position: sticky;
			top: 0;
			height: 100dvh;
			display: flex;
			flex-direction: column;
			border-bottom: 0;
			border-right: 1px solid var(--line);
		}
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 18px;
		margin-bottom: 18px;
	}

	.logo svg {
		width: 34px;
		height: 34px;
	}

	.logo small {
		display: block;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	nav {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	@media (min-width: 960px) {
		nav {
			flex-direction: column;
		}
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border-radius: 10px;
		text-decoration: none;
		color: var(--muted);
		font-weight: 600;
	}

	nav a:hover {
		background: rgba(255, 255, 255, 0.04);
		color: var(--text);
	}

	nav a[aria-current='page'] {
		background: rgba(198, 244, 50, 0.1);
		color: var(--accent);
	}

	nav svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.side-foot {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
	}

	@media (min-width: 960px) {
		.side-foot {
			margin-top: auto;
		}
	}

	.who {
		width: 100%;
		margin: 6px 0 0;
		font-size: 12px;
	}

	.main {
		padding: 24px 20px 60px;
		max-width: 1200px;
		width: 100%;
	}

	@media (min-width: 960px) {
		.main {
			padding: 36px 40px 80px;
		}
	}
</style>
