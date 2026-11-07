/**
 * Preparation orchestrator. A run builds a completely new dataset (reports for every
 * user) and only after everything succeeded swaps it in as the active dataset for the
 * year, in a single transaction. A failed or cancelled run leaves the previous dataset
 * untouched. Only one run executes at a time.
 */
import { all, get, run, tx } from '../db';
import { config, configProblems, seerrEnabled } from '../config';
import * as jf from '../integrations/jellyfin';
import * as js from '../integrations/jellystat';
import * as seerr from '../integrations/seerr';
import { buildViews } from './normalize';
import { resolveMetadata, tmdbDetails, tmdbPoster, type PlaybackHint } from './resolve';
import { buildReport, titleRef, type UserRequestSummary } from './report';
import { normId, requestStats, type NormalizedRequest } from './requests';
import { popularityCandidates, titleStats } from './aggregate';
import { fromLocal, toLocal, yearStart } from './time';
import { ensureArt } from '../artwork';
import { featuredTitles, refreshSoundtracks } from '../soundtrack';
import { activeLinkForUser, createLink } from '../links';
import type { PlaybackRecord } from './model';
import type { WrappedReport } from '$shared/report';

export interface PrepProgress {
	datasetId: number;
	year: number;
	phase: string;
	step: number;
	steps: number;
	done: number;
	total: number;
	startedAt: number;
	status: 'running' | 'ready' | 'failed' | 'cancelled';
	error?: string;
}

const STEPS = ['Checking configuration', 'Loading users', 'Fetching playback history', 'Fetching Seerr requests', 'Resolving metadata', 'Cleaning playback', 'Building reports', 'Caching artwork', 'Finding soundtracks', 'Publishing dataset'];

let current: { progress: PrepProgress; log: string[]; cancel: boolean } | null = null;

export function currentRun() {
	return current ? { progress: { ...current.progress }, log: current.log.slice(-200) } : null;
}

export function cancelRun(): boolean {
	if (!current || current.progress.status !== 'running') return false;
	current.cancel = true;
	return true;
}

class Cancelled extends Error {}

/** Mark runs left "running" by a crashed/restarted process as failed. */
export function recoverInterruptedRuns() {
	run(`UPDATE datasets SET status = 'failed', error = 'Interrupted (server restarted)', finished_at = ? WHERE status = 'running'`, Date.now());
	// Remove reports of datasets that never became active
	run(`DELETE FROM reports WHERE dataset_id IN (SELECT id FROM datasets WHERE status IN ('failed','cancelled'))`);
}

export function preparationRange(year: number, now = Date.now(), tz = config().timezone) {
	const rangeStart = yearStart(year, tz);
	const nextYear = yearStart(year + 1, tz);
	const yearToDate = now < nextYear;
	const rangeEnd = yearToDate ? now : nextYear;
	return { rangeStart, rangeEnd, yearToDate };
}

export function startPreparation(year: number, startedBy: string | null): { ok: true; datasetId: number } | { ok: false; error: string } {
	if (current?.progress.status === 'running') return { ok: false, error: 'A preparation is already running' };
	const nowYear = new Date(toLocal(Date.now(), config().timezone)).getUTCFullYear();
	if (!Number.isInteger(year) || year < 2000 || year > nowYear) return { ok: false, error: 'Invalid year' };
	const problems = configProblems().filter((p) => !p.startsWith('SEERR') && !p.startsWith('APP_SECRET'));
	if (problems.length) return { ok: false, error: problems.join('; ') };

	const tz = config().timezone;
	const { rangeStart, rangeEnd, yearToDate } = preparationRange(year);
	const info = run(
		`INSERT INTO datasets (year, status, started_at, range_start, range_end, timezone, started_by) VALUES (?, 'running', ?, ?, ?, ?, ?)`,
		year,
		Date.now(),
		rangeStart,
		rangeEnd,
		tz,
		startedBy
	);
	const datasetId = Number(info.lastInsertRowid);
	current = {
		progress: { datasetId, year, phase: STEPS[0], step: 1, steps: STEPS.length, done: 0, total: 0, startedAt: Date.now(), status: 'running' },
		log: [],
		cancel: false
	};
	const state = current;
	void execute(state, { datasetId, year, rangeStart, rangeEnd, yearToDate, tz });
	return { ok: true, datasetId };
}

interface RunParams {
	datasetId: number;
	year: number;
	rangeStart: number;
	rangeEnd: number;
	yearToDate: boolean;
	tz: string;
}

async function execute(state: NonNullable<typeof current>, p: RunParams) {
	const log = (msg: string) => {
		const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
		state.log.push(line);
		if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
		console.log(`[prep ${p.year}] ${msg}`);
	};
	let lastPersist = 0;
	const persist = (force = false) => {
		if (!force && Date.now() - lastPersist < 1000) return;
		lastPersist = Date.now();
		run('UPDATE datasets SET progress = ?, log = ? WHERE id = ?', JSON.stringify(state.progress), JSON.stringify(state.log.slice(-200)), p.datasetId);
	};
	const step = (i: number) => {
		if (state.cancel) throw new Cancelled('Cancelled by admin');
		state.progress.step = i + 1;
		state.progress.phase = STEPS[i];
		state.progress.done = 0;
		state.progress.total = 0;
		log(STEPS[i]);
		persist(true);
	};
	const progress = (done: number, total: number, phase?: string) => {
		if (state.cancel) throw new Cancelled('Cancelled by admin');
		state.progress.done = done;
		state.progress.total = total;
		if (phase) state.progress.phase = phase;
		persist();
	};
	const warnings: string[] = [];

	try {
		step(0);
		log(`Range ${new Date(p.rangeStart).toISOString()} → ${new Date(p.rangeEnd).toISOString()} (${p.tz}${p.yearToDate ? ', year to date' : ''})`);
		if (!seerrEnabled()) warnings.push('Seerr is not configured: request slides and TMDb popularity are unavailable');

		// ---- users
		step(1);
		const users = (await jf.listUsers()).filter((u) => u.Id);
		const now = Date.now();
		tx(() => {
			for (const u of users) {
				run(
					`INSERT INTO users (id, name, is_admin, is_disabled, image_tag, last_activity, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_admin=excluded.is_admin, is_disabled=excluded.is_disabled,
					 image_tag=excluded.image_tag, last_activity=excluded.last_activity, synced_at=excluded.synced_at`,
					normId(u.Id),
					u.Name,
					u.Policy?.IsAdministrator ? 1 : 0,
					u.Policy?.IsDisabled ? 1 : 0,
					u.PrimaryImageTag ?? null,
					u.LastActivityDate ?? null,
					now
				);
			}
		});
		log(`${users.length} Jellyfin users`);

		// ---- playback rows (insert time = end time, so pad the window by a day each side)
		step(2);
		const rows = await js.fetchPlaybackActivity(new Date(p.rangeStart - 86_400_000), new Date(p.rangeEnd + 86_400_000), (n, pages) =>
			progress(n, pages, `Fetching playback history (${n.toLocaleString()} rows)`)
		);
		log(`${rows.length.toLocaleString()} playback rows from Jellystat`);

		// ---- seerr requests
		step(3);
		let requests: NormalizedRequest[] = [];
		const requestTmdb = new Map<string, { tmdbId: number; type: 'movie' | 'tv' }>();
		if (seerrEnabled()) {
			try {
				const raw = await seerr.fetchAllRequests((n) => progress(n, 0, `Fetching Seerr requests (${n})`));
				for (const r of raw) {
					if (!r.media?.tmdbId) continue;
					const type = (r.media.mediaType ?? r.type) as 'movie' | 'tv';
					for (const mid of [r.media.jellyfinMediaId, r.media.jellyfinMediaId4k]) if (mid) requestTmdb.set(normId(mid), { tmdbId: r.media.tmdbId, type });
					if (!r.requestedBy?.jellyfinUserId) continue;
					requests.push({
						userId: normId(r.requestedBy.jellyfinUserId),
						createdAt: Date.parse(r.createdAt),
						mediaType: type,
						tmdbId: r.media.tmdbId,
						jellyfinMediaId: r.media.jellyfinMediaId ? normId(r.media.jellyfinMediaId) : null,
						status: r.status
					});
				}
				log(`${raw.length} Seerr requests (${requests.length} linked to Jellyfin users)`);
			} catch (e) {
				warnings.push(`Seerr requests unavailable: ${(e as Error).message}`);
				log(`WARNING: ${(e as Error).message}`);
				requests = [];
			}
		}

		// ---- metadata
		step(4);
		const importedTz = js.importedTimezone();
		const hints: PlaybackHint[] = [];
		for (const r of rows) {
			if (r.EpisodeId) {
				hints.push({ itemId: normId(r.EpisodeId), kind: 'episode', name: r.NowPlayingItemName, seriesName: r.SeriesName, seriesId: normId(r.NowPlayingItemId) });
				hints.push({ itemId: normId(r.NowPlayingItemId), kind: 'series', name: r.SeriesName, seriesName: r.SeriesName });
			} else if (r.NowPlayingItemId) {
				hints.push({ itemId: normId(r.NowPlayingItemId), kind: 'movie', name: r.NowPlayingItemName });
			}
		}
		const resolved = await resolveMetadata(hints, requestTmdb, log, (d, t, phase) => progress(d, t, phase));
		log(
			`Metadata: ${resolved.stats.fromJellyfin} live, ${resolved.stats.fromCache} cached, ${resolved.stats.fromJellystat} from Jellystat archive, ${resolved.stats.fromPlaybackOnly} name-only; ${resolved.stats.tmdbResolved} matched to TMDb`
		);

		// ---- normalize
		step(5);
		const records: PlaybackRecord[] = [];
		let skipped = 0;
		for (const r of rows) {
			const itemId = normId(r.EpisodeId || r.NowPlayingItemId);
			const meta = resolved.items.get(itemId);
			const seconds = Number(r.PlaybackDuration);
			let ts = Date.parse(r.ActivityDateInserted);
			if (!meta || meta.kind === 'other' || !Number.isFinite(ts) || !(seconds > 0)) {
				skipped++;
				continue;
			}
			let start: number, end: number;
			if (r.imported) {
				if (importedTz) ts = fromLocal(ts, importedTz); // stored wall-clock reinterpreted in the plugin's zone
				start = ts;
				end = ts + seconds * 1000;
			} else {
				end = ts;
				start = ts - seconds * 1000;
			}
			records.push({
				id: String(r.Id),
				userId: normId(r.UserId),
				kind: meta.kind,
				unitKey: meta.unitKey,
				titleKey: meta.titleKey,
				season: meta.season,
				episode: meta.episode,
				start,
				end,
				seconds,
				runtimeSec: meta.runtimeSec
			});
		}
		const views = buildViews(records, { rangeStart: p.rangeStart, rangeEnd: p.rangeEnd });
		log(`${records.length.toLocaleString()} usable rows → ${views.length.toLocaleString()} meaningful views (${skipped} rows skipped: non-video or unresolvable)`);
		if (skipped > rows.length * 0.2 && rows.length > 50) warnings.push(`${skipped} playback rows could not be matched to a movie or episode`);

		// server-wide popularity distribution (anonymous)
		const serverPopularity = popularityCandidates(titleStats(views), resolved.titles).map((c) => c.popularity);

		// ---- reports
		step(6);
		const viewsByUser = new Map<string, typeof views>();
		for (const v of views) {
			let l = viewsByUser.get(v.userId);
			if (!l) viewsByUser.set(v.userId, (l = []));
			l.push(v);
		}
		const keysFor = (r: NormalizedRequest) => {
			const kind = r.mediaType === 'movie' ? 'movie' : 'series';
			const keys = [`${kind}:tmdb:${r.tmdbId}`];
			if (r.jellyfinMediaId) {
				const m = resolved.items.get(r.jellyfinMediaId);
				if (m) keys.push(m.titleKey);
				keys.push(`${kind}:jf:${r.jellyfinMediaId}`);
			}
			return keys;
		};
		// only users checked on the Users page get a Wrapped (everyone's viewing still feeds server-wide stats)
		const userRows = all<{ id: string; name: string; is_disabled: number }>('SELECT id, name, is_disabled FROM users WHERE included = 1');
		const totalUsers = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? userRows.length;
		log(`Preparing Wrappeds for ${userRows.length} of ${totalUsers} users (selected on the Users page)`);
		let built = 0,
			withReport = 0;
		const completenessUsers: Record<string, { slides: number; minutes: number; reason?: string }> = {};
		for (const u of userRows) {
			progress(built, userRows.length, `Building reports (${u.name})`);
			const userViews = viewsByUser.get(u.id) ?? [];
			let reqSummary: UserRequestSummary | null = null;
			if (seerrEnabled() && requests.length) {
				const rs = requestStats(u.id, requests, views, p, keysFor);
				if (rs.total) {
					const toRef = async (t: (typeof rs.titles)[number]) => {
						const key = t.keys.find((k) => resolved.titles.has(k));
						if (key) return titleRef(resolved.titles.get(key), key);
						const d = await tmdbDetails(t.mediaType, t.tmdbId);
						if (!d) return null;
						return {
							key: `${t.mediaType === 'movie' ? 'movie' : 'series'}:tmdb:${t.tmdbId}`,
							kind: t.mediaType === 'movie' ? ('movie' as const) : ('series' as const),
							title: d.title,
							year: d.year,
							poster: await ensureArt(tmdbPoster(d)),
							backdrop: null
						};
					};
					const posterTitles = await Promise.all(rs.titles.slice(0, 12).map(toRef));
					const examples = (await Promise.all(rs.goodTaste.slice(0, 6).map(toRef))).filter((x) => x !== null);
					reqSummary = {
						total: rs.total,
						movies: rs.movies,
						shows: rs.shows,
						titles: rs.titles.slice(0, 12).map((t, i) => ({ kind: t.mediaType === 'movie' ? 'movie' : 'series', meta: null, posterTitle: posterTitles[i] })),
						goodTasteTitles: rs.goodTaste.length,
						goodTasteViewers: rs.goodTasteViewers,
						goodTasteExamples: examples
					};
				}
			}
			const out = await buildReport({
				userId: u.id,
				userName: u.name,
				year: p.year,
				yearToDate: p.yearToDate,
				views: userViews,
				ctx: { tz: p.tz, rangeStart: p.rangeStart, rangeEnd: p.rangeEnd, titles: resolved.titles },
				serverPopularity,
				requests: reqSummary
			});
			if (out.report) {
				run(
					'INSERT INTO reports (dataset_id, user_id, user_name, slide_count, minutes, report, stats) VALUES (?, ?, ?, ?, ?, ?, ?)',
					p.datasetId,
					u.id,
					u.name,
					out.report.slides.length,
					out.minutes,
					JSON.stringify(out.report),
					JSON.stringify(out.stats)
				);
				withReport++;
			}
			completenessUsers[u.id] = { slides: out.report?.slides.length ?? 0, minutes: out.minutes, reason: out.report ? undefined : String(out.stats.reason ?? '') };
			built++;
		}
		log(`${withReport} of ${userRows.length} users have a Wrapped`);

		step(7); // artwork is fetched while building; this step just reports it
		const art = get<{ c: number }>("SELECT COUNT(*) AS c FROM artwork WHERE status = 'ok'")?.c ?? 0;
		log(`${art} artwork images cached`);

		// ---- soundtracks for the titles that appear on slides (never fails the run)
		step(8);
		const reports = all<{ report: string }>('SELECT report FROM reports WHERE dataset_id = ?', p.datasetId).map((r) => JSON.parse(r.report) as WrappedReport);
		let soundtrack: Awaited<ReturnType<typeof refreshSoundtracks>> | null = null;
		try {
			const featured = featuredTitles(reports);
			const library = new Map([...resolved.titles.values()].map((t) => [t.key, { jellyfinIds: t.jellyfinIds, inLibrary: !t.missingFromLibrary }]));
			soundtrack = await refreshSoundtracks(featured, library, log, (d, t, phase) => progress(d, t, phase));
			log(`Soundtracks: ${soundtrack.titles} featured titles, ${soundtrack.matched} new Deezer matches, ${soundtrack.themes} theme songs cached`);
			if (soundtrack.errors) warnings.push(`${soundtrack.errors} soundtrack lookups failed (Deezer); they'll be retried next time`);
		} catch (e) {
			if (e instanceof Cancelled) throw e;
			warnings.push(`Soundtrack step failed: ${(e as Error).message}`);
			log(`WARNING: soundtrack step failed: ${(e as Error).message}`);
		}

		// ---- publish atomically
		step(9);
		const completeness = {
			playbackRows: rows.length,
			usableRows: records.length,
			skippedRows: skipped,
			views: views.length,
			users: userRows.length,
			usersWithReport: withReport,
			metadata: resolved.stats,
			requests: requests.length,
			seerr: seerrEnabled(),
			soundtrack,
			warnings,
			perUser: completenessUsers
		};
		tx(() => {
			const prev = get<{ dataset_id: number }>('SELECT dataset_id FROM active_datasets WHERE year = ?', p.year);
			run(
				`INSERT INTO active_datasets (year, dataset_id, activated_at) VALUES (?, ?, ?)
				 ON CONFLICT(year) DO UPDATE SET dataset_id = excluded.dataset_id, activated_at = excluded.activated_at`,
				p.year,
				p.datasetId,
				Date.now()
			);
			run(
				`UPDATE datasets SET status = 'ready', finished_at = ?, completeness = ?, progress = ?, log = ? WHERE id = ?`,
				Date.now(),
				JSON.stringify(completeness),
				JSON.stringify({ ...state.progress, status: 'ready' }),
				JSON.stringify(state.log.slice(-200)),
				p.datasetId
			);
			if (prev && prev.dataset_id !== p.datasetId) {
				run(`UPDATE datasets SET status = 'superseded' WHERE id = ?`, prev.dataset_id);
				run('DELETE FROM reports WHERE dataset_id = ?', prev.dataset_id);
			}
		});
		state.progress.status = 'ready';
		log(`Dataset #${p.datasetId} is now live for ${p.year}`);

		// Personal links for everyone who got a Wrapped (existing links are kept as they are)
		let newLinks = 0;
		for (const r of all<{ user_id: string }>('SELECT user_id FROM reports WHERE dataset_id = ?', p.datasetId)) {
			if (!activeLinkForUser(r.user_id)) {
				createLink(r.user_id, startedByName(p.datasetId));
				newLinks++;
			}
		}
		if (newLinks) log(`Created ${newLinks} personal link${newLinks === 1 ? '' : 's'}`);
	} catch (e) {
		const cancelled = e instanceof Cancelled;
		const message = (e as Error).message || String(e);
		state.progress.status = cancelled ? 'cancelled' : 'failed';
		state.progress.error = message;
		log(`${cancelled ? 'CANCELLED' : 'FAILED'}: ${message}`);
		if (!cancelled) console.error(e);
		tx(() => {
			run('DELETE FROM reports WHERE dataset_id = ?', p.datasetId);
			run(
				'UPDATE datasets SET status = ?, finished_at = ?, error = ?, progress = ?, log = ? WHERE id = ?',
				cancelled ? 'cancelled' : 'failed',
				Date.now(),
				message,
				JSON.stringify(state.progress),
				JSON.stringify(state.log.slice(-200)),
				p.datasetId
			);
		});
	}
}

function startedByName(datasetId: number): string | null {
	return get<{ started_by: string | null }>('SELECT started_by FROM datasets WHERE id = ?', datasetId)?.started_by ?? null;
}
