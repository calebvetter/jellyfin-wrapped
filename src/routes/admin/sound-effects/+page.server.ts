import { listAudio } from '$lib/server/soundtrack';
import { getSetting, setSetting } from '$lib/server/db';
import { ytdlpStatus } from '$lib/server/integrations/youtube';
import { SFX } from '$shared/sfx';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = listAudio().filter((a) => a.title_key.startsWith('sfx:'));
	return {
		sfx: SFX.map((s) => {
			const a = rows.find((r) => r.title_key === `sfx:${s.id}`);
			return {
				...s,
				custom: a
					? {
							id: a.id,
							source: a.source,
							name: a.track_title ?? a.original_name ?? 'Custom sound',
							sourceUrl: a.source_url,
							duration: a.duration,
							start: a.start,
							end: a.segment_end,
							gain: a.gain,
							url: `/audio/t/${a.id}`
						}
					: null
			};
		}),
		sfxEnabled: getSetting('sfx_enabled') !== '0',
		youtube: await ytdlpStatus()
	};
};

export const actions: Actions = {
	enabled: async ({ request }) => {
		const form = await request.formData();
		setSetting('sfx_enabled', form.get('enabled') === 'on' ? '1' : '0');
		return { saved: true };
	}
};
