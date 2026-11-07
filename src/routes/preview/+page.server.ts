import { error } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { mockReport } from '$lib/mock/mockReport';
import { getSetting } from '$lib/server/db';
import type { PersonalityId } from '$shared/report';
import type { PageServerLoad } from './$types';
import { buildMusicPlan } from '$lib/server/music-plan';
import { customSfx, fallbackTracks, slotTracks } from '$lib/server/soundtrack';
import { featuredYear } from '$lib/server/reports';
import type { WrappedReport } from '$shared/report';

function musicForMock(report: WrappedReport) {
	const year = featuredYear();
	return buildMusicPlan(report, new Map(), year ? fallbackTracks(year) : [], slotTracks());
}

/**
 * Mock-data preview of the full experience for visual development (no integrations).
 * Enabled by MOCK_PREVIEW (default: on in development, off in production).
 * Query: ?personality=<id>&variant=light|heavy&name=Sam&slide=<index>&hold=1&noart=1
 */
export const load: PageServerLoad = ({ url }) => {
	if (!config().mockPreview) error(404, 'Not found');
	const q = url.searchParams;
	const report = mockReport({
		name: q.get('name') ?? undefined,
		personality: (q.get('personality') as PersonalityId) ?? undefined,
		variant: (['light', 'heavy'] as const).find((v) => v === q.get('variant')) ?? 'full',
		noArt: q.get('noart') === '1'
	});
	const slide = q.get('slide');
	return {
		report,
		// mock titles have no soundtracks: preview the most-featured real music on this server, if any
		music: musicForMock(report),
		customSfx: customSfx(),
		sfxEnabled: getSetting('sfx_enabled') !== '0',
		startAt: slide !== null && slide !== '' ? Number(slide) : null,
		hold: q.get('hold') === '1'
	};
};
