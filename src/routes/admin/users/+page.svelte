<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CopyButton from '$lib/admin/CopyButton.svelte';
	import TimezonePicker from '$lib/admin/TimezonePicker.svelte';
	import { page } from '$app/state';
	import { copyRich, isPrivateOrigin, wrappedEmail } from '$lib/admin/email';
	import { ago, fmtMinutes, pct } from '$lib/admin/util';

	let { data, form } = $props();
	let q = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	// optimistic checkbox state, re-synced from the server after each save
	let included = $state<Record<string, boolean>>({});
	$effect(() => {
		included = Object.fromEntries(data.users.map((u) => [u.id, u.included === 1]));
	});

	const users = $derived(data.users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())));
	const checkedCount = $derived(data.users.filter((u) => included[u.id]).length);
	const visibleChecked = $derived(users.filter((u) => included[u.id]).length);
	const allChecked = $derived(users.length > 0 && visibleChecked === users.length);
	const someChecked = $derived(visibleChecked > 0 && !allChecked);
	const withReport = $derived(data.users.filter((u) => u.report).length);

	// per-user timezone ('' = the default), saved as soon as it's picked
	let tzs = $state<Record<string, string>>({});
	let tzSaved = $state<string | null>(null);
	$effect(() => {
		tzs = Object.fromEntries(data.users.map((u) => [u.id, u.timezone ?? '']));
	});
	async function saveTimezone(id: string, timezone: string) {
		error = null;
		try {
			const res = await fetch('/api/admin/users/timezone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, timezone: timezone || null }) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed');
			tzSaved = id;
			setTimeout(() => tzSaved === id && (tzSaved = null), 1600);
		} catch (e) {
			tzs[id] = data.users.find((u) => u.id === id)?.timezone ?? '';
			error = `Couldn't save the timezone: ${(e as Error).message}`;
		}
	}

	// "Copy email": a ready-to-send HTML email with the user's share link
	let emailed = $state<{ name: string; subject: string } | null>(null);
	let emailedId = $state<string | null>(null);
	let emailTimer: ReturnType<typeof setTimeout> | undefined;
	const privateOrigin = $derived(isPrivateOrigin(page.url.origin));

	async function copyEmail(u: { id: string; name: string; linkUrl: string | null }) {
		if (!u.linkUrl || !data.year) return;
		const mail = wrappedEmail({ name: u.name, year: data.year, url: u.linkUrl, origin: page.url.origin, from: data.user?.name ?? null });
		try {
			await copyRich(mail.html, mail.text);
			error = null;
			emailed = { name: u.name, subject: mail.subject };
			emailedId = u.id;
			clearTimeout(emailTimer);
			emailTimer = setTimeout(() => (emailedId = null), 1600);
		} catch (e) {
			error = `Couldn't copy the email: ${(e as Error).message}`;
		}
	}

	async function save(ids: string[], value: boolean) {
		const before = { ...included };
		for (const id of ids) included[id] = value;
		saving = true;
		error = null;
		try {
			const res = await fetch('/api/admin/users/include', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, included: value }) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed');
			await invalidateAll();
		} catch (e) {
			included = before;
			error = (e as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Users · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Users</h1>
		<p>
			<strong>{checkedCount}</strong> of {data.users.length} users checked — only checked users get a Wrapped (and a link) when you
			<a href="/admin">prepare</a>. {withReport} currently have a {data.year ?? ''} Wrapped.
		</p>
	</div>
	<div class="row">
		{#if data.years.length > 1}
			<form class="row">
				<select name="year" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Year">
					{#each data.years as y}<option value={y} selected={y === data.year}>{y}</option>{/each}
				</select>
			</form>
		{/if}
		<input type="text" placeholder="Search users" bind:value={q} aria-label="Search users" />
		<form method="POST" action="?/sync" use:enhance><button class="btn">Refresh from Jellyfin</button></form>
	</div>
</div>

{#if form && 'error' in form && form.error}<p class="alert bad">{form.error}</p>{/if}
{#if form && 'synced' in form}<p class="alert ok">Synced {form.synced} users from Jellyfin.</p>{/if}
{#if error}<p class="alert bad" role="alert">{error}</p>{/if}
{#if emailed}
	<div class="alert ok email-note" role="status">
		<div>
			<strong>Email for {emailed.name} copied.</strong> Subject: “{emailed.subject}”
			{#if privateOrigin}<br /><span class="muted">Images won't load for recipients from {page.url.host}. Copy from your public address instead.</span>{/if}
		</div>
		<div class="row" style="flex-wrap:nowrap">
			<CopyButton text={emailed.subject} label="Copy subject" />
			<button type="button" class="btn small" onclick={() => (emailed = null)} aria-label="Dismiss">✕</button>
		</div>
	</div>
{/if}

<section class="card">
	{#if !data.users.length}
		<p class="muted">No users yet. Click “Refresh from Jellyfin” or run a preparation.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="check">
							<input
								type="checkbox"
								checked={allChecked}
								indeterminate={someChecked}
								disabled={saving}
								aria-label={allChecked ? 'Uncheck all users' : 'Check all users'}
								onchange={() => save(users.map((u) => u.id), !allChecked)}
							/>
						</th>
						<th>User</th>
						<th>Timezone</th>
						<th class="num">Watch time</th>
						<th class="num">Slides</th>
						<th class="num">Views</th>
						<th class="num">Completed</th>
						<th>Last viewed</th>
						<th></th>
						<th class="num">Link</th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.id)}
						<tr class:off={!included[u.id]}>
							<td class="check">
								<input type="checkbox" checked={included[u.id]} disabled={saving} aria-label="Prepare a Wrapped for {u.name}" onchange={(e) => save([u.id], e.currentTarget.checked)} />
							</td>
							<td>
								<a href="/admin/users/{u.id}"><strong>{u.name}</strong></a>
								{#if u.is_admin}<span class="badge accent">admin</span>{/if}
								{#if u.is_disabled}<span class="badge bad">disabled</span>{/if}
							</td>
							<td class="tz-cell">
								<TimezonePicker
									compact
									label="Timezone for {u.name}"
									bind:value={tzs[u.id]}
									emptyLabel="Default ({data.defaultTimezone})"
									emptyShort="Default"
									disabled={!included[u.id]}
									title={included[u.id] ? undefined : 'Check this user to set their timezone'}
									onchange={(tz) => saveTimezone(u.id, tz)}
								/>
								{#if tzSaved === u.id}<span class="saved" aria-live="polite">✓</span>{/if}
							</td>
							<td class="num">{u.report ? fmtMinutes(u.report.minutes) : '—'}</td>
							<td class="num">{u.report ? u.report.slide_count : '—'}</td>
							<td class="num">{u.engagement?.visits ?? 0}</td>
							<td class="num">{u.engagement ? pct(u.engagement.completed_visits / Math.max(1, u.engagement.visits)) : '—'}</td>
							<td>{u.engagement ? ago(u.engagement.last_view) : 'never'}</td>
							<td>
								<div class="row actions">
									<a class="btn small" href="/admin/users/{u.id}">Stats</a>
									{#if u.report}<a class="btn small" href="/admin/preview/{u.id}{data.year ? `?year=${data.year}` : ''}">Preview</a>{/if}
								</div>
							</td>
							<td class="num link-cell">
								{#if u.linkUrl}
									<div class="row actions">
										<CopyButton text={u.linkUrl} label="Copy link" variant="ok" />
										{#if u.report && data.year}
											<button type="button" class="btn small" onclick={() => copyEmail(u)} title="Copy a ready-to-send email with {u.name}'s link">
												{emailedId === u.id ? 'Copied ✓' : 'Copy email'}
											</button>
										{/if}
									</div>
								{:else}
									<span class="muted small" title="Created automatically the next time you prepare (for checked users with a Wrapped)">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.check {
		width: 36px;
	}

	.check input {
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	tr.off td:not(.check) {
		opacity: 0.45;
	}

	/* button pairs stack when the table is tight, so it fits without scrolling */
	.actions {
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 6px;
	}

	@media (min-width: 1440px) {
		.actions {
			flex-wrap: nowrap;
		}
	}

	.tz-cell {
		white-space: nowrap;
	}

	.saved {
		margin-left: 6px;
		color: var(--ok);
		font-weight: 700;
	}

	/* messages above the table get breathing room */
	.alert {
		margin-bottom: 16px;
	}

	.email-note {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.small {
		font-size: 12px;
	}
</style>
