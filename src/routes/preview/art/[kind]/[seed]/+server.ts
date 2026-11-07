import { error } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { seeded } from '$lib/story/format';
import type { RequestHandler } from './$types';

const PALETTES = [
	['#ff3ea5', '#2a0a73', '#ffe14d'],
	['#c6f432', '#0e5c4a', '#ffffff'],
	['#ff6a13', '#3b0a1e', '#ffe14d'],
	['#2de2e6', '#08123d', '#ff3ea5'],
	['#ffe14d', '#6a1cf6', '#ffffff'],
	['#c9b6ff', '#2448ff', '#c6f432']
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function lines(title: string, max = 10): string[] {
	const out: string[] = [];
	let cur = '';
	for (const w of title.toUpperCase().split(/\s+/)) {
		if ((cur + ' ' + w).trim().length > max && cur) {
			out.push(cur);
			cur = w;
		} else cur = (cur + ' ' + w).trim();
	}
	if (cur) out.push(cur);
	return out.slice(0, 4);
}

/** Generated artwork for mock preview mode only (fictional titles, no real posters). */
export const GET: RequestHandler = ({ params }) => {
	if (!config().mockPreview) error(404, 'Not found');
	const seed = decodeURIComponent(params.seed);
	const rnd = seeded(seed);
	const [a, b, c] = PALETTES[Math.floor(rnd() * PALETTES.length)];
	let svg = '';
	if (params.kind === 'poster' || params.kind === 'backdrop') {
		const wide = params.kind === 'backdrop';
		const W = wide ? 1280 : 400;
		const H = wide ? 720 : 600;
		const shapes = Array.from({ length: 5 }, () => {
			const x = rnd() * W;
			const y = rnd() * H * 0.7;
			const r = 30 + rnd() * (wide ? 260 : 140);
			return rnd() > 0.5
				? `<circle cx="${x}" cy="${y}" r="${r}" fill="${rnd() > 0.5 ? a : c}" opacity="${0.35 + rnd() * 0.6}"/>`
				: `<rect x="${x - r}" y="${y - r / 2}" width="${r * 2}" height="${r}" transform="rotate(${rnd() * 90 - 45} ${x} ${y})" fill="${a}" opacity="0.5"/>`;
		}).join('');
		const ls = lines(seed);
		const fs = wide ? 92 : 56;
		const text = wide
			? ''
			: ls.map((l, i) => `<text x="28" y="${H - 40 - (ls.length - 1 - i) * fs * 0.95}" font-family="Impact, 'Arial Black', sans-serif" font-size="${fs}" fill="#fff">${esc(l)}</text>`).join('');
		svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="#0b0614"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>${shapes}<rect width="${W}" height="${H}" fill="url(#s)"/>${text}</svg>`;
	} else if (params.kind === 'person') {
		svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
<defs><radialGradient id="g" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
<rect width="400" height="500" fill="url(#g)"/>
<ellipse cx="200" cy="200" rx="88" ry="104" fill="#2a1a24"/>
<path d="M60 500c8-110 70-170 140-170s132 60 140 170z" fill="#2a1a24"/>
<path d="M112 190c-6-90 60-130 110-118 60 14 80 60 70 120-20-40-60-56-110-50-30 4-50 20-70 48z" fill="#140a10"/></svg>`;
	} else error(404, 'Not found');
	return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
};
