import { featuredYear, reportsForYear } from '$lib/server/reports';
import { ensureTitles, featuredTitles, listAudio, localCover, slotAssignments, titleMatches, withLocalCovers, type AudioRow } from '$lib/server/soundtrack';
import { GENERIC_KEY } from '$shared/music';
import { slideTitleKeys } from '$lib/server/music-plan';
import { CONFIDENT_ALBUM_SCORE, deezerEnabled } from '$lib/server/integrations/deezer';
import { ytdlpStatus } from '$lib/server/integrations/youtube';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const year = Number(url.searchParams.get('year')) || featuredYear();
	const reports = year ? reportsForYear(year) : [];
	const featured = featuredTitles(reports);
	ensureTitles(featured);
	const matches = titleMatches();
	const audio = listAudio();

	const titles = await Promise.all(featured.map(async (f) => {
		const m = matches.get(f.key);
		const files = audio
			.filter((a) => a.title_key === f.key)
			.map((a) => ({
				id: a.id,
				source: a.source,
				deezerTrackId: a.deezer_track_id,
				trackTitle: a.track_title,
				artist: a.artist,
				duration: a.duration,
				start: a.start,
				end: a.segment_end,
				sourceUrl: a.source_url,
				gain: a.gain,
				enabled: a.enabled === 1,
				url: `/audio/t/${a.id}`
			}));
		return {
			...f,
			status: m?.status ?? 'pending',
			album: m?.album ? { ...m.album, cover: await localCover(m.album.cover) } : null,
			lowConfidence: Boolean(m?.album && m.status === 'auto' && (m.album.score ?? 0) < CONFIDENT_ALBUM_SCORE),
			candidates: await withLocalCovers((m?.candidates ?? []).slice(0, 8)),
			tracks: (m?.tracks ?? []).slice(0, 25),
			audio: files,
			selectedTrackId: files.find((a) => a.source !== 'theme')?.deezerTrackId ?? null,
			musicOff: m?.musicOff ?? false,
			hasMusic: !m?.musicOff && files.some((a) => a.enabled)
		};
	}));

	const totalWeight = titles.reduce((s, t) => s + t.weight, 0);
	const withMusic = new Set(titles.filter((t) => t.hasMusic).map((t) => t.key));
	const coveredWeight = titles.filter((t) => t.hasMusic).reduce((s, t) => s + t.weight, 0);

	return {
		year,
		titles,
		stats: {
			reports: reports.length,
			titles: titles.length,
			withMusic: withMusic.size,
			// share of "music moments" (weighted slide appearances) that have music
			coverage: totalWeight ? coveredWeight / totalWeight : 0,
			// users whose own slides feature at least one title with music
			usersWithMusic: reports.filter((r) => r.slides.some((s) => slideTitleKeys(s).some((k) => withMusic.has(k)))).length
		},
		deezer: deezerEnabled(),
		youtube: await ytdlpStatus(),
		generic: {
			audio: audio.filter((a) => a.title_key === GENERIC_KEY).map(audioView),
			slots: slotAssignments()
		}
	};
};

function audioView(a: AudioRow) {
	return {
		id: a.id,
		source: a.source,
		trackTitle: a.track_title,
		artist: a.artist,
		duration: a.duration,
		start: a.start,
		end: a.segment_end,
		sourceUrl: a.source_url,
		gain: a.gain,
		enabled: a.enabled === 1,
		url: `/audio/t/${a.id}`
	};
}
