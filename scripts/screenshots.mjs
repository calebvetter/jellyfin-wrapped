#!/usr/bin/env node
/**
 * Render every story slide with Playwright for visual review.
 *
 *   pnpm screenshots                         # all slides, mobile + desktop, from /preview
 *   pnpm screenshots -- --slides 2,3 --sizes mobile --wait 9000
 *   pnpm screenshots -- --query "personality=tastemaker&variant=light"
 *   pnpm screenshots -- --gate               # also capture the "tap to start" gate
 *
 * Output: screenshots/<size>-<index>-<kind>.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};
const base = opt('base', `http://localhost:${process.env.DEV_PORT ?? 5173}`);
const wait = Number(opt('wait', 7000));
const query = opt('query', '');
const sizes = opt('sizes', 'mobile,desktop').split(',');
const only = opt('slides', null)?.split(',').map(Number) ?? null;
const out = path.resolve(opt('out', 'screenshots'));
const prefix = opt('prefix', '');
const VIEWPORTS = {
	mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
	for (const size of sizes) {
		const ctx = await browser.newContext({ ...VIEWPORTS[size], reducedMotion: args.includes('--reduced') ? 'reduce' : 'no-preference' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
		page.on('console', (m) => m.type() === 'error' && console.error(`[console] ${m.text()}`));
		if (args.includes('--gate')) {
			await page.goto(`${base}/preview?${query}`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(2500);
			await page.screenshot({ path: path.join(out, `${prefix}${size}-gate.png`) });
		}
		// discover slide count
		await page.goto(`${base}/preview?slide=0&${query}`, { waitUntil: 'networkidle' });
		const count = await page.locator('.bar').count();
		for (let i = 0; i < count; i++) {
			if (only && !only.includes(i)) continue;
			await page.goto(`${base}/preview?slide=${i}&hold=1&${query}`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(wait);
			// freeze the story timer so it doesn't advance mid-capture
			const kind = await page.evaluate(() => document.querySelector('.layer [data-kind]')?.getAttribute('data-kind') ?? 'slide');
			const file = path.join(out, `${prefix}${size}-${String(i).padStart(2, '0')}-${kind}.png`);
			await page.screenshot({ path: file });
			console.log(file);
		}
		await ctx.close();
	}
} finally {
	await browser.close();
}
