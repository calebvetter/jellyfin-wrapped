<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyButton from '$lib/admin/CopyButton.svelte';
	import { ago, fmtDate, fmtDuration, fmtMinutes, pct } from '$lib/admin/util';
	import { SLIDE_LABELS, type SlideKind } from '$shared/report';

	let { data, form } = $props();

	type Stats = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	const st = $derived((data.stats ?? {}) as Stats);
	const linkUrl = $derived((form && 'linkUrl' in form ? form.linkUrl : null) ?? data.link?.url ?? null);
	const label = (k: string) => SLIDE_LABELS[k as SlideKind] ?? k;
	const pm = $derived(st.personalityMetrics as Record<string, number | string | null> | undefined);
</script>

<svelte:head><title>{data.profile.name} · Wrapped Admin</title></svelte:head>

<div class="page-head">
	<div>
		<p><a href="/admin/users">← Users</a></p>
		<h1>{data.profile.name}</h1>
		<p>
			{#if data.profile.is_admin}<span class="badge accent">admin</span>{/if}
			{#if data.profile.is_disabled}<span class="badge bad">disabled</span>{/if}
			Jellyfin id <code>{data.profile.id}</code>
		</p>
	</div>
	<div class="row">
		{#if data.years.length > 1}
			<form class="row">
				<select name="year" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
					{#each data.years as y}<option value={y} selected={y === data.year}>{y}</option>{/each}
				</select>
			</form>
		{/if}
		{#if data.slides.length}<a class="btn primary" href="/admin/preview/{data.profile.id}?year={data.year}">▶ Launch their Wrapped</a>{/if}
	</div>
</div>

<div class="grid cols-2">
	<section class="card">
		<div class="card-head"><h2>Personal link</h2>{#if data.link}<span class="badge ok">active</span>{/if}</div>
		<p class="muted" style="margin-top:0">A passwordless URL that opens straight into {data.profile.name}'s Wrapped. Treat it like a password — anyone with it can view this user's Wrapped (and nothing else).</p>
		{#if linkUrl}
			<div class="row">
				<input class="link-url mono" readonly value={linkUrl} aria-label="Personal link" onfocus={(e) => e.currentTarget.select()} />
				<CopyButton text={linkUrl} label="Copy link" />
			</div>
			{#if data.link}<p class="muted" style="margin:8px 0 0">Created {fmtDate(data.link.createdAt)} · last opened {ago(data.link.lastUsedAt)} · {data.link.useCount} opens</p>{/if}
			<div class="row" style="margin-top:12px">
				<form method="POST" action="?/link" use:enhance><button class="btn small">Regenerate</button></form>
				<form method="POST" action="?/revoke" use:enhance><button class="btn small danger">Revoke</button></form>
			</div>
		{:else}
			<form method="POST" action="?/link" use:enhance><button class="btn primary">Generate personal link</button></form>
		{/if}
	</section>

	<section class="card">
		<div class="card-head"><h2>Engagement {data.year ?? ''}</h2></div>
		{#if data.engagement}
			{@const e = data.engagement}
			<div class="stats">
				<div class="stat"><span class="v">{e.visits}</span><span class="k">Views</span></div>
				<div class="stat"><span class="v">{e.sessions}</span><span class="k">Unique sessions</span></div>
				<div class="stat"><span class="v">{pct(e.completed_visits / Math.max(1, e.visits))}</span><span class="k">Completion</span></div>
				<div class="stat"><span class="v">{e.rewatches}</span><span class="k">Rewatches</span></div>
				<div class="stat"><span class="v">{e.furthest + 1}/{e.slide_count}</span><span class="k">Furthest slide</span></div>
				<div class="stat"><span class="v">{fmtDuration(e.active_ms)}</span><span class="k">Total time</span></div>
			</div>
			<p class="muted" style="margin:10px 0 0">First viewed {fmtDate(e.first_view)} · most recently {fmtDate(e.last_view)} · {e.link_visits} via personal link</p>
		{:else}
			<p class="muted">Hasn't opened their Wrapped yet.</p>
		{/if}
	</section>
</div>

{#if !data.stats}
	<section class="card" style="margin-top:16px"><p class="muted">No prepared Wrapped for this user{data.year ? ` in ${data.year}` : ''}.</p></section>
{:else}
	<section class="card" style="margin-top:16px">
		<div class="card-head"><h2>Prepared statistics · {data.year}</h2><span class="muted">{data.slides.length} slides: {data.slides.map(label).join(' · ')}</span></div>
		<div class="stats">
			<div class="stat"><span class="v">{fmtMinutes(st.totals?.minutes)}</span><span class="k">Watch time</span></div>
			<div class="stat"><span class="v">{st.totals?.movies}</span><span class="k">Movies</span></div>
			<div class="stat"><span class="v">{st.totals?.episodes}</span><span class="k">Episodes</span></div>
			<div class="stat"><span class="v">{st.totals?.series}</span><span class="k">Series</span></div>
			<div class="stat"><span class="v">{st.totals?.rewatchViews}</span><span class="k">Rewatches</span></div>
			<div class="stat"><span class="v">{st.streak?.days ?? 0}d</span><span class="k">Longest streak</span></div>
		</div>
	</section>

	<div class="grid cols-2" style="margin-top:16px">
		<section class="card">
			<h2>Top shows</h2>
			<table>
				<thead><tr><th>#</th><th>Title</th><th class="num">Time</th><th class="num">Plays</th><th class="num">Score</th></tr></thead>
				<tbody>
					{#each st.topShows ?? [] as t}<tr><td>{t.rank}</td><td>{t.title}</td><td class="num">{fmtMinutes(t.minutes)}</td><td class="num">{t.plays}</td><td class="num">{t.score}</td></tr>{/each}
				</tbody>
			</table>
		</section>
		<section class="card">
			<h2>Top movies</h2>
			<table>
				<thead><tr><th>#</th><th>Title</th><th class="num">Time</th><th class="num">Views</th><th class="num">Score</th></tr></thead>
				<tbody>
					{#each st.topMovies ?? [] as t}<tr><td>{t.rank}</td><td>{t.title}</td><td class="num">{fmtMinutes(t.minutes)}</td><td class="num">{t.plays}</td><td class="num">{t.score}</td></tr>{/each}
				</tbody>
			</table>
		</section>
		<section class="card">
			<h2>Genres</h2>
			<table>
				<tbody>
					{#each (st.genres ?? []).slice(0, 12) as g}
						<tr><td>{g.name}</td><td class="bar-cell"><div class="hbar"><i style:width="{(g.share / (st.genres[0]?.share || 1)) * 100}%"></i></div></td><td class="num">{pct(g.share)}</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
		<section class="card">
			<h2>Personality scores</h2>
			<table>
				<tbody>
					{#each st.personalityScores ?? [] as p}
						<tr><td>{p.name}</td><td class="bar-cell"><div class="hbar"><i style:width="{Math.min(100, (p.strength / 3) * 100)}%" style:background={p.strength >= 1 ? 'var(--accent)' : 'rgba(255,255,255,.25)'}></i></div></td><td class="num">{p.strength}</td></tr>
					{/each}
				</tbody>
			</table>
			<p class="muted" style="margin:8px 0 0">Strength ≥ 1 qualifies; the strongest qualifying trait wins.</p>
		</section>
		<section class="card">
			<h2>Actors (by distinct titles)</h2>
			<p class="muted" style="margin:4px 0 10px">Ranked by how many different movies/series you genuinely watched (movie ≥ 40 min or finished; series ≥ 2 episodes or ≥ 1 h) list them in their top-15 billed cast; ties broken by watch time. Expand an actor to audit.</p>
			{#each st.actors ?? [] as a}
				<details class="actor">
					<summary><strong>{a.name}</strong> · {a.titles} titles · {fmtMinutes(a.minutes)}</summary>
					{#if a.breakdown}
						<table>
							<tbody>
								{#each a.breakdown as t}
									<tr>
										<td>{t.title}</td>
										<td class="muted">{t.character ? `as ${t.character}` : ''}</td>
										<td class="num muted">billed #{t.billing ?? '?'}</td>
										<td class="num">{t.episodes ? `${t.episodes} eps · ` : ''}{fmtMinutes(t.minutes)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<p class="muted">Re-prepare to see the per-title breakdown.</p>
					{/if}
				</details>
			{/each}
		</section>
		<section class="card">
			<h2>Binges, clock & requests</h2>
			<table>
				<tbody>
					{#each st.binges ?? [] as b}<tr><td>{b.title}</td><td class="num">{b.episodes} eps</td><td class="num">{fmtMinutes(b.minutes)}</td><td class="muted">{b.start?.replace('T', ' ')}</td></tr>{/each}
				</tbody>
			</table>
			<p class="muted">Viewing clock: <strong>{st.clock?.persona}</strong> ({pct(st.clock?.share)}) · Busiest day: {st.busiestDay?.date ?? '—'} ({fmtMinutes(st.busiestDay?.minutes)})</p>
			{#if st.requests}<p class="muted">Requests: {st.requests.total} ({st.requests.movies} movies, {st.requests.shows} shows) · Good Taste: {st.requests.goodTasteTitles} titles watched by {st.requests.goodTasteViewers} others</p>{/if}
		</section>
	</div>

	{#if pm}
		<section class="card" style="margin-top:16px">
			<details>
				<summary>Personality inputs (raw metrics)</summary>
				<div class="stats" style="margin-top:12px">
					{#each Object.entries(pm) as [k, v]}
						<div class="stat"><span class="v" style="font-size:16px">{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : (v ?? '—')}</span><span class="k">{k}</span></div>
					{/each}
				</div>
			</details>
		</section>
	{/if}

	<section class="card" style="margin-top:16px">
		<details>
			<summary>All watched titles ({st.allTitles?.length ?? 0})</summary>
			<div class="table-wrap" style="margin-top:10px">
				<table>
					<thead><tr><th>Title</th><th>Type</th><th class="num">Time</th><th class="num">Plays</th><th class="num">Episodes</th><th class="num">Popularity</th><th></th></tr></thead>
					<tbody>
						{#each st.allTitles ?? [] as t}
							<tr><td>{t.title}</td><td>{t.kind}</td><td class="num">{fmtMinutes(t.minutes)}</td><td class="num">{t.plays}</td><td class="num">{t.kind === 'series' ? t.units : ''}</td><td class="num">{t.popularity ?? '—'}</td><td>{#if t.missingFromLibrary}<span class="badge warn">deleted</span>{/if}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</section>
{/if}

{#if data.slideEngagement.length}
	<section class="card" style="margin-top:16px">
		<h2>Slide engagement</h2>
		<table>
			<thead><tr><th>Slide</th><th class="num">Views</th><th class="num">Time spent</th><th class="num">Skipped</th><th class="num">Revisited</th></tr></thead>
			<tbody>
				{#each data.slideEngagement as s}
					<tr><td>{label(s.slide_id)}</td><td class="num">{s.enters}</td><td class="num">{fmtDuration(s.dwell_ms)}</td><td class="num">{s.skips}</td><td class="num">{s.revisits}</td></tr>
				{/each}
			</tbody>
		</table>
		<h3 style="margin-top:18px">Recent visits</h3>
		<table>
			<thead><tr><th>Started</th><th>Via</th><th class="num">Furthest</th><th>Completed</th><th class="num">Rewatches</th><th class="num">Time</th></tr></thead>
			<tbody>
				{#each data.visits as v}
					<tr><td>{fmtDate(v.started_at)}</td><td>{v.mode === 'link' ? 'Personal link' : 'Sign-in'}</td><td class="num">{v.furthest_index + 1}/{v.slide_count}</td><td>{v.completed ? '✓' : '—'}</td><td class="num">{v.rewatches}</td><td class="num">{fmtDuration(v.active_ms)}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}
