<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fmtDate, fmtDuration, fmtMinutes } from '$lib/admin/util';
	import TimezonePicker from '$lib/admin/TimezonePicker.svelte';
	import { viewerTimezone } from '$shared/clock';

	let { data, form } = $props();

	type Run = NonNullable<typeof data.run>;
	let run = $state<Run | null>(null);
	let year = $state(0);
	let busy = $state(false);
	$effect(() => {
		run = data.run;
	});
	$effect(() => {
		if (!year) year = data.currentYear;
	});

	const yearOptions = $derived(Array.from({ length: 8 }, (_, i) => data.currentYear - i));
	const running = $derived(run?.progress.status === 'running');
	const progressPct = $derived(
		run ? Math.min(100, ((run.progress.step - 1 + (run.progress.total ? run.progress.done / run.progress.total : 0)) / run.progress.steps) * 100) : 0
	);

	// the server default timezone; until an admin saves one, start from this browser's zone
	let tz = $state('');
	$effect(() => {
		tz = data.timezone ?? viewerTimezone() ?? 'UTC';
	});
	let tzForm: HTMLFormElement | undefined = $state();
	let tzSaved = $state(false);

	onMount(() => {
		let wasRunning = false;
		const timer = setInterval(async () => {
			if (!running && !wasRunning) return;
			const res = await fetch('/api/admin/prep');
			if (!res.ok) return;
			const body = await res.json();
			run = body.run;
			const nowRunning = body.run?.progress.status === 'running';
			if (wasRunning && !nowRunning) await invalidateAll();
			wasRunning = nowRunning;
		}, 1000);
		return () => clearInterval(timer);
	});

	const statusClass = (s: string) => (s === 'ready' ? 'ok' : s === 'running' ? 'accent' : s === 'failed' ? 'bad' : '');
	const activeIds = $derived(new Set(data.active.map((a) => a.dataset_id)));
</script>

<svelte:head><title>Preparation · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Prepare Wrapped</h1>
		<p>Gather playback history, metadata and cross-user stats ahead of time. Re-running replaces the year's dataset atomically — the previous one stays live until the new one succeeds.</p>
	</div>
</div>

<div class="grid cols-2">
	<section class="card">
		<div class="card-head"><h2>Run preparation</h2></div>
		<form
			method="POST"
			action="?/timezone"
			class="row"
			style="margin-bottom:12px;align-items:flex-start"
			bind:this={tzForm}
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false, invalidateAll: false });
					tzSaved = result.type === 'success';
				}}
		>
			<span class="muted" style="padding-top:9px">Timezone</span>
			<TimezonePicker
				bind:value={tz}
				name="timezone"
				onchange={() => {
					tzSaved = false;
					queueMicrotask(() => tzForm?.requestSubmit());
				}}
			/>
			{#if tzSaved}<span class="badge ok" style="margin-top:6px">saved</span>{/if}
		</form>
		<p class="muted" style="margin:-4px 0 14px">
			For days, streaks and year boundaries.
			{#if data.userOverrides.length}
				Own timezone:
				{data.userOverrides.map((u) => `${u.name} (${u.timezone})`).join(', ')}.
			{:else}
				Users can have their own on the <a href="/admin/users">Users</a> page.
			{/if}
		</p>
		<form
			method="POST"
			action="?/prepare"
			class="row"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
					const res = await fetch('/api/admin/prep');
					if (res.ok) run = (await res.json()).run;
				};
			}}
		>
			<input type="hidden" name="timezone" value={tz} />
			<label class="row">
				<span class="muted">Year</span>
				<select name="year" bind:value={year}>
					{#each yearOptions as y}<option value={y}>{y}{y === data.currentYear ? ' (year to date)' : ''}</option>{/each}
				</select>
			</label>
			<button class="btn primary" disabled={running || busy}>{running ? 'Preparing…' : 'Prepare ' + year}</button>
		</form>
		{#if year === data.currentYear}
			<p class="muted" style="margin:10px 0 0">The current year covers January 1 through the moment preparation runs.</p>
		{/if}
		{#if data.totalUsers}
			<p class="muted" style="margin:6px 0 0">
				Wrappeds (and links) will be prepared for <strong>{data.selectedUsers}</strong> of {data.totalUsers} users —
				<a href="/admin/users">choose who on the Users page</a>.
			</p>
		{/if}
		{#if form && 'error' in form && form.error}<p class="alert bad" style="margin-top:12px">{form.error}</p>{/if}

		{#if run}
			<div class="stack" style="margin-top:18px">
				<div class="row" style="justify-content:space-between">
					<strong>{run.progress.year} · step {run.progress.step}/{run.progress.steps}: {run.progress.phase}</strong>
					<span class="badge {statusClass(run.progress.status)}">{run.progress.status}</span>
				</div>
				<div class="progress" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin="0" aria-valuemax="100">
					<i style:width="{run.progress.status === 'ready' ? 100 : progressPct}%"></i>
				</div>
				{#if run.progress.total}<p class="muted" style="margin:0">{run.progress.done.toLocaleString()} / {run.progress.total.toLocaleString()}</p>{/if}
				{#if run.progress.error}<p class="alert bad">{run.progress.error}</p>{/if}
				<div class="log mono">{run.log.slice(-60).join('\n')}</div>
				{#if running}
					<form method="POST" action="?/cancel" use:enhance><button class="btn danger small">Cancel run</button></form>
				{/if}
			</div>
		{/if}
	</section>

	<section class="card">
		<div class="card-head">
			<h2>Integrations</h2>
			<form method="POST" action="?/test" use:enhance><button class="btn small">Test connections</button></form>
		</div>
		{#if form && 'services' in form && form.services}
			<table>
				<tbody>
					{#each form.services as s}
						<tr>
							<td><strong>{s.name}</strong></td>
							<td><span class="badge {s.ok ? 'ok' : s.configured ? 'bad' : 'warn'}">{s.ok ? 'connected' : s.configured ? 'error' : 'not set'}</span></td>
							<td class="muted">{s.detail}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="muted">Credentials and URLs come from environment variables only. Use “Test connections” to verify Jellyfin, Jellystat and Seerr are reachable from the server.</p>
		{/if}

		<div class="card-head" style="margin-top:22px"><h2>Featured year</h2></div>
		<p class="muted" style="margin-top:0">Sign-ins and links open this year by default.</p>
		<form method="POST" action="?/feature" class="row" use:enhance>
			<select name="year">
				<option value="">Newest prepared year{data.featured ? ` (${data.years[0]})` : ''}</option>
				{#each data.years as y}<option value={y} selected={data.featured === y && data.years[0] !== y}>{y}</option>{/each}
			</select>
			<button class="btn small">Save</button>
			{#if data.featured}<span class="badge accent">Live: {data.featured}</span>{/if}
		</form>
	</section>
</div>

<section class="card" style="margin-top:16px">
	<div class="card-head"><h2>Datasets</h2><span class="muted">Most recent first</span></div>
	{#if !data.datasets.length}
		<p class="muted">Nothing prepared yet. Pick a year above and hit Prepare.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>#</th><th>Year</th><th>Status</th><th>Prepared</th><th>Took</th><th class="num">Users</th><th class="num">Watch time</th><th>Data completeness</th></tr>
				</thead>
				<tbody>
					{#each data.datasets as d}
						<tr>
							<td class="muted">{d.id}</td>
							<td><strong>{d.year}</strong> {#if activeIds.has(d.id)}<span class="badge accent">live</span>{/if}</td>
							<td><span class="badge {statusClass(d.status)}">{d.status}</span></td>
							<td>{fmtDate(d.finishedAt ?? d.startedAt)}<br /><span class="muted">by {d.startedBy ?? '—'} · through {fmtDate(d.rangeEnd, false)}</span></td>
							<td>{d.finishedAt ? fmtDuration(d.finishedAt - d.startedAt) : '—'}</td>
							<td class="num">{d.reports || (d.completeness?.usersWithReport ?? '—')}</td>
							<td class="num">{d.minutes ? fmtMinutes(d.minutes) : '—'}</td>
							<td>
								{#if d.error}
									<span class="muted">{d.error}</span>
								{:else if d.completeness}
									{@const c = d.completeness}
									<details>
										<summary>
											{c.views?.toLocaleString()} views · {c.metadata?.tmdbResolved} titles matched to TMDb
											{#if c.warnings?.length}<span class="badge warn">{c.warnings.length} warning{c.warnings.length > 1 ? 's' : ''}</span>{/if}
										</summary>
										<ul class="muted" style="margin:8px 0 0;padding-left:18px">
											<li>{c.playbackRows?.toLocaleString()} playback rows → {c.usableRows?.toLocaleString()} usable ({c.skippedRows} skipped)</li>
											<li>Metadata: {c.metadata?.fromJellyfin} live in Jellyfin, {c.metadata?.fromCache} from cache, {c.metadata?.fromJellystat} recovered from Jellystat's archive, {c.metadata?.fromPlaybackOnly} name-only</li>
											<li>{c.metadata?.titlesMissingFromLibrary} watched titles are no longer in the library (history preserved)</li>
											<li>{c.metadata?.titlesWithPopularity} titles with TMDb popularity · {c.requests} Seerr requests</li>
											<li>{c.usersWithReport} of {c.users} users have enough viewing for a Wrapped</li>
											{#each c.warnings ?? [] as w}<li style="color:var(--warn)">{w}</li>{/each}
										</ul>
									</details>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
