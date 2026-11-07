<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CopyButton from '$lib/admin/CopyButton.svelte';
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
			<strong>{checkedCount}</strong> of {data.users.length} users checked — only checked users get a Wrapped (and a personal link) when you
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
						<th class="num">Watch time</th>
						<th class="num">Slides</th>
						<th class="num">Views</th>
						<th class="num">Completed</th>
						<th>Last viewed</th>
						<th></th>
						<th class="num">Personal link</th>
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
							<td class="num">{u.report ? fmtMinutes(u.report.minutes) : '—'}</td>
							<td class="num">{u.report ? u.report.slide_count : '—'}</td>
							<td class="num">{u.engagement?.visits ?? 0}</td>
							<td class="num">{u.engagement ? pct(u.engagement.completed_visits / Math.max(1, u.engagement.visits)) : '—'}</td>
							<td>{u.engagement ? ago(u.engagement.last_view) : 'never'}</td>
							<td>
								<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
									<a class="btn small" href="/admin/users/{u.id}">Stats</a>
									{#if u.report}<a class="btn small" href="/admin/preview/{u.id}{data.year ? `?year=${data.year}` : ''}">Preview</a>{/if}
								</div>
							</td>
							<td class="num link-cell">
								{#if u.linkUrl}
									<CopyButton text={u.linkUrl} label="Copy link" variant="ok" />
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

	.link-cell {
		white-space: nowrap;
	}

	.small {
		font-size: 12px;
	}
</style>
