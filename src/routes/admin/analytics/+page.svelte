<script lang="ts">
	import { ago, fmtDate, fmtDuration, pct } from '$lib/admin/util';
	import { SLIDE_LABELS, type SlideKind } from '$shared/report';

	let { data } = $props();
	const label = (k: string) => SLIDE_LABELS[k as SlideKind] ?? k;
	const maxReach = $derived(Math.max(1, ...data.slides.slides.map((s) => s.visits_reached)));
	const maxDwell = $derived(Math.max(1, ...data.slides.slides.map((s) => s.dwell_ms / Math.max(1, s.enters))));
</script>

<svelte:head><title>Engagement · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Engagement</h1>
		<p>First-party, privacy-conscious analytics. Admin previews are never counted. No IPs or user agents are stored.</p>
	</div>
	{#if data.years.length}
		<form class="row">
			<select name="year" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Year">
				{#each data.years as y}<option value={y} selected={y === data.year}>{y}</option>{/each}
			</select>
		</form>
	{/if}
</div>

{#if !data.users.length}
	<section class="card"><p class="muted">No one has opened their {data.year ?? ''} Wrapped yet.</p></section>
{:else}
	<section class="card">
		<div class="stats">
			<div class="stat"><span class="v">{data.viewers}</span><span class="k">Viewers</span></div>
			<div class="stat"><span class="v">{data.totals.visits}</span><span class="k">Views</span></div>
			<div class="stat"><span class="v">{data.totals.sessions}</span><span class="k">Unique sessions</span></div>
			<div class="stat"><span class="v">{pct(data.totals.completed / Math.max(1, data.totals.visits))}</span><span class="k">Completion rate</span></div>
			<div class="stat"><span class="v">{data.totals.rewatches}</span><span class="k">Rewatches</span></div>
			<div class="stat"><span class="v">{fmtDuration(data.totals.activeMs / Math.max(1, data.totals.visits))}</span><span class="k">Avg. time / view</span></div>
			<div class="stat"><span class="v">{pct(data.totals.linkVisits / Math.max(1, data.totals.visits))}</span><span class="k">Via link</span></div>
		</div>
	</section>

	<section class="card">
		<div class="card-head"><h2>Slide funnel</h2><span class="muted">Across all viewers · drop-off counts visits abandoned on that slide for 30+ minutes</span></div>
		<div class="table-wrap">
			<table>
				<thead><tr><th>Slide</th><th>Reached</th><th class="num">Avg. time</th><th class="num">Skip rate</th><th class="num">Revisits</th><th class="num">Drop-offs</th></tr></thead>
				<tbody>
					{#each data.slides.slides as s}
						<tr>
							<td><strong>{s.slide_index + 1}.</strong> {label(s.slide_id)}</td>
							<td class="bar-cell">
								<div class="row" style="gap:8px;flex-wrap:nowrap">
									<div class="hbar" style="flex:1"><i style:width="{(s.visits_reached / maxReach) * 100}%"></i></div>
									<span class="num" style="min-width:42px">{pct(s.visits_reached / Math.max(1, data.slides.totalVisits))}</span>
								</div>
							</td>
							<td class="num">
								<div class="row" style="gap:8px;flex-wrap:nowrap;justify-content:flex-end">
									<span>{fmtDuration(s.dwell_ms / Math.max(1, s.enters))}</span>
									<div class="hbar" style="width:60px"><i style:width="{(s.dwell_ms / Math.max(1, s.enters) / maxDwell) * 100}%" style="background:#2de2e6"></i></div>
								</div>
							</td>
							<td class="num">{pct(s.skips / Math.max(1, s.enters))}</td>
							<td class="num">{s.revisits}</td>
							<td class="num">{#if s.dropped_here}<span class="badge warn">{s.dropped_here}</span>{:else}0{/if}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="card">
		<h2>Per user</h2>
		<div class="table-wrap">
			<table>
				<thead><tr><th>User</th><th class="num">Views</th><th class="num">Sessions</th><th class="num">Devices</th><th>Completed</th><th class="num">Furthest</th><th class="num">Rewatches</th><th class="num">Total time</th><th>First viewed</th><th>Last viewed</th></tr></thead>
				<tbody>
					{#each data.users as u}
						<tr>
							<td><a href="/admin/users/{u.user_id}?year={data.year}"><strong>{u.name}</strong></a></td>
							<td class="num">{u.visits}</td>
							<td class="num">{u.sessions}</td>
							<td class="num">{u.devices}</td>
							<td>{u.completed_visits ? `✓ ${pct(u.completed_visits / u.visits)}` : '—'}</td>
							<td class="num">{u.furthest + 1}/{u.slide_count}</td>
							<td class="num">{u.rewatches}</td>
							<td class="num">{fmtDuration(u.active_ms)}</td>
							<td>{fmtDate(u.first_view, false)}</td>
							<td>{ago(u.last_view)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
