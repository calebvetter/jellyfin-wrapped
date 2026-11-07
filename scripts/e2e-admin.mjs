#!/usr/bin/env node
/**
 * End-to-end smoke test against a running dev server wired to scripts/fake-upstreams.mjs.
 * Signs in as admin, prepares the current year, waits for completion, visits every admin
 * page, checks the personal links preparation created, opens one anonymously and plays a
 * few slides (which records analytics), exercises the soundtrack, generic music and sound
 * effects tools, then screenshots everything into screenshots/e2e-*.png.
 *
 *   node scripts/e2e-admin.mjs [--base http://localhost:5173] [--user alice --pass alice]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const base = opt('base', 'http://localhost:5173');
const user = opt('user', 'alice');
const pass = opt('pass', 'alice');
fs.mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `screenshots/e2e-${name}.png`, fullPage: true });

// 1. login
await page.goto(base);
await shot('login');
await page.fill('input[name=username]', user);
await page.fill('input[name=password]', pass);
await Promise.all([page.waitForURL(/\/admin/), page.click('button[type=submit]')]);
console.log('✓ signed in as admin →', page.url());

// 2. test connections + prepare
await page.click('text=Test connections');
await page.waitForSelector('text=connected');
console.log('✓ services:', (await page.locator('table').first().innerText()).replace(/\s+/g, ' ').slice(0, 200));
async function prepare() {
	await page.goto(`${base}/admin`);
	const prevId = (await (await page.request.get(`${base}/api/admin/prep`)).json()).run?.progress.datasetId ?? 0;
	await page.click('button.primary:has-text("Prepare")');
	const t0 = Date.now();
	let run = null;
	for (let i = 0; i < 300; i++) {
		await page.waitForTimeout(1000);
		run = (await (await page.request.get(`${base}/api/admin/prep`)).json()).run;
		if (run && run.progress.datasetId > prevId && run.progress.status !== 'running') break;
	}
	console.log(`✓ preparation #${prevId + 1} finished: ${run?.progress.status} in ~${((Date.now() - t0) / 1000).toFixed(0)}s`);
	return { status: run?.progress.status ?? 'running', log: run?.log ?? [] };
}
const prep1 = await prepare();
const status = prep1.status;
console.log('  ' + prep1.log.filter((l) => /Preparing Wrappeds for|personal link/.test(l)).join(' · '));
await page.waitForTimeout(1500);
await page.reload();
await page.locator('details summary').first().click().catch(() => {});
await shot('dashboard');
if (!/ready/i.test(status)) {
	console.log(await page.locator('.log').innerText().catch(() => ''));
	process.exitCode = 1;
}

// 3. users: every prepared user got a personal link (green "Copy link" button)
await page.goto(`${base}/admin/users`);
const rows = await page.locator('tbody tr').count();
const copies = await page.locator('tbody tr button:has-text("Copy link")').count();
console.log(`✓ users page: ${copies} of ${rows} users have a "Copy link" button`);
if (!copies) process.exitCode = 1;
await shot('users');

// 3b. uncheck the last user → the next preparation skips them; then check everyone again
{
	const last = page.locator('tbody tr input[type=checkbox]').last();
	const name = (await last.getAttribute('aria-label')).replace('Prepare a Wrapped for ', '');
	await last.uncheck();
	await page.waitForTimeout(800);
	await page.reload();
	const still = await page.locator('tbody tr input[type=checkbox]').last().isChecked();
	console.log(`✓ unchecked ${name}: ${still ? 'NOT saved' : 'saved'}`);
	if (still) process.exitCode = 1;
	await shot('users-unchecked');
	const prep2 = await prepare();
	const line = prep2.log.find((l) => l.includes('Preparing Wrappeds for')) ?? '(no log line)';
	console.log(`  ${line.replace(/^.*?Preparing/, 'Preparing')}`);
	if (!line.includes(`for ${rows - 1} of ${rows}`)) process.exitCode = 1;
	await page.goto(`${base}/admin/users`);
	await page.locator('thead input[type=checkbox]').check();
	await page.waitForTimeout(800);
	await page.reload();
	const checked = await page.locator('tbody tr input[type=checkbox]:checked').count();
	console.log(`✓ "check all" → ${checked} of ${rows} checked`);
	if (checked !== rows) process.exitCode = 1;
}

const firstUser = page.locator('tbody tr a').first();
const href = await firstUser.getAttribute('href');
await page.goto(base + href);
await shot('user-detail');

// 4. the personal link was created during preparation
const linkInput = page.locator('input.link-url');
await linkInput.waitFor({ timeout: 5000 });
const link = await linkInput.inputValue();
console.log('✓ personal link created by preparation:', link.replace(/\/w\/.+/, '/w/[token]'));

// 5. open link anonymously, play through a few slides (records analytics)
const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const ap = await anon.newPage();
ap.on('pageerror', (e) => errors.push(`[link] ${e.message}`));
await ap.goto(link);
await ap.click('text=Start without sound');
for (let i = 0; i < 4; i++) {
	await ap.waitForTimeout(2500);
	await ap.screenshot({ path: `screenshots/e2e-link-slide-${i}.png` });
	await ap.keyboard.press('ArrowRight');
}
await ap.waitForTimeout(9000);
await ap.keyboard.press('ArrowRight'); // navigation flush (throttled to 8 s)
await ap.waitForTimeout(1500);
await ap.close();
await anon.close();
console.log('✓ personal link played anonymously');

// invalid token → 404
const bad = await (await browser.newContext()).newPage();
const r = await bad.goto(`${base}/w/${'A'.repeat(43)}`);
console.log(`✓ bogus token → HTTP ${r.status()}`);

// 6. soundtracks: album covers are cached locally (CSP img-src 'self'); preview a track
//    (play → loading → stop states), then "Use" it: its 30 s Deezer preview gets cached.
{
	await page.goto(`${base}/admin/soundtrack`);
	const card = page.locator('article.title-card').filter({ has: page.locator('table.tracks') }).first();
	const title = (await card.locator('h3').innerText()).trim();
	const cover = await card.locator('img.cover').getAttribute('src');
	console.log(`✓ album cover served locally: ${cover?.startsWith('/art/') ? cover.slice(0, 14) + '…' : `NO (${cover})`}`);
	if (!cover?.startsWith('/art/')) process.exitCode = 1;

	const row = card.locator('table.tracks tbody tr').first();
	const trackTitle = (await row.locator('strong').innerText()).trim();
	const play = row.locator('button.play');
	await play.click();
	const states = new Set();
	for (let i = 0; i < 40; i++) {
		states.add((await play.innerText()).trim());
		if ([...states].some((s) => s.includes('Stop'))) break;
		await page.waitForTimeout(50);
	}
	console.log(`✓ preview button states: ${[...states].join(' → ')}`);
	await play.click(); // stop

	await row.locator('button:has-text("Use")').click();
	await card.locator('.badge:has-text("Selected")').waitFor({ timeout: 30000 });
	console.log(`✓ picked "${trackTitle}" for ${title}: preview cached`);
	await shot('soundtrack-selected');

	// YouTube: grab a short clip with the server's yt-dlp, then choose an 11-second segment
	const yt = opt('yt', 'https://youtu.be/jNQXAC9IVRw'); // "Me at the zoo", 19 s
	if (yt !== 'skip') {
		await page.goto(`${base}/admin/soundtrack`);
		const ytCard = page.locator('article.title-card').first();
		const ytTitle = (await ytCard.locator('h3').innerText()).trim();
		await ytCard.locator('input[type=url]').fill(yt);
		const t0 = Date.now();
		await ytCard.locator('button:has-text("Grab audio")').click();
		await ytCard.locator('.seg').waitFor({ timeout: 180000 });
		const info = (await ytCard.locator('.audio .small').first().innerText()).replace(/\s+/g, ' ');
		console.log(`✓ grabbed YouTube audio for ${ytTitle} in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${info}`);
		await page.waitForTimeout(1500); // waveform decode
		await ytCard.locator('.seg input[type=number]').nth(0).fill('3');
		await ytCard.locator('.seg input[type=number]').nth(1).fill('14');
		await ytCard.locator('button:has-text("Save segment")').click();
		await ytCard.locator('.small:has-text("plays 0:03–0:14")').waitFor({ timeout: 10000 });
		console.log('✓ saved an 11-second segment (0:03–0:14)');
		await shot('soundtrack-youtube');
	}

	// "No music" decision, then undo
	await page.goto(`${base}/admin/soundtrack`);
	const nm = page.locator('article.title-card').first();
	const nmTitle = (await nm.locator('h3').innerText()).trim();
	await nm.locator('button:has-text("use no music")').click();
	await nm.locator('.badge:has-text("No music")').waitFor({ timeout: 10000 });
	await shot('soundtrack-nomusic');
	await nm.locator('button:has-text("Choose music after all")').click();
	await nm.locator('button:has-text("use no music")').waitFor({ timeout: 10000 });
	console.log(`✓ marked ${nmTitle} as "no music", then undid it`);
}

// 7. generic music: add a Deezer song, assign it to the intro and the finale
{
	await page.goto(`${base}/admin/soundtrack`);
	const gm = page.locator('section.generic');
	await gm.locator('input[aria-label="Search Deezer songs"]').fill('upbeat');
	await gm.locator('button:has-text("Search")').click();
	const hit = gm.locator('.hits li').first();
	await hit.waitFor({ timeout: 15000 });
	const song = (await hit.locator('strong').innerText()).trim();
	await hit.locator('button:has-text("Add")').click();
	await gm.locator('.audio').first().waitFor({ timeout: 30000 });
	for (const screen of ['Intro', 'Year in review & Rewatch']) {
		await gm.locator(`select[aria-label="Music for ${screen}"]`).selectOption({ index: 1 });
		await page.waitForTimeout(800);
	}
	await page.reload();
	const used = await gm.locator('.audio .used').first().innerText();
	console.log(`✓ generic music "${song}" ${used}`);
	if (!used.includes('Intro')) process.exitCode = 1;
	await gm.screenshot({ path: 'screenshots/e2e-generic-music.png' });
}

// 8. sound effects: replace "Pop" with an uploaded file, trim it, then reset it
{
	await page.goto(`${base}/admin/sound-effects`);
	await shot('sound-effects');
	const card = page.locator('section.sfx').filter({ has: page.locator('h2:text-is("Pop")') });
	const n = 8000;
	const wav = Buffer.alloc(44 + n);
	wav.write('RIFF', 0, 'latin1');
	wav.writeUInt32LE(36 + n, 4);
	wav.write('WAVE', 8, 'latin1');
	wav.write('fmt ', 12, 'latin1');
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8000, 24);
	wav.writeUInt32LE(8000, 28);
	wav.writeUInt16LE(1, 32);
	wav.writeUInt16LE(8, 34);
	wav.write('data', 36, 'latin1');
	wav.writeUInt32LE(n, 40);
	for (let i = 0; i < n; i++) wav[44 + i] = 128 + Math.round(100 * Math.sin(i / 6) * Math.exp(-i / 1500));
	await card.locator('input[type=file]').setInputFiles({ name: 'my-pop.wav', mimeType: 'audio/wav', buffer: wav });
	await card.locator('.badge:has-text("Replaced")').waitFor({ timeout: 15000 });
	await card.locator('.seg').waitFor({ timeout: 5000 });
	await page.waitForTimeout(800);
	await card.locator('.seg input[type=number]').nth(0).fill('0.05');
	await card.locator('.seg input[type=number]').nth(1).fill('0.4');
	await card.locator('button:has-text("Save segment")').click();
	await card.locator('.small:has-text("(0.35 s)")').waitFor({ timeout: 10000 });
	console.log('✓ replaced the Pop sound with an upload and trimmed it to 0.35 s');
	await card.screenshot({ path: 'screenshots/e2e-sfx-replaced.png' });
	page.once('dialog', (d) => d.accept());
	await card.locator('button:has-text("Reset to default")').click();
	await card.locator('.badge:has-text("Replaced")').waitFor({ state: 'detached', timeout: 10000 });
	console.log('✓ reset Pop to the built-in sound');
}

// 9. remaining admin pages
await page.waitForTimeout(1500);
for (const p of ['analytics', 'soundtrack']) {
	await page.goto(`${base}/admin/${p}`);
	await shot(p);
}
await page.goto(base + href.replace('/admin/users/', '/admin/preview/'));
await page.click('text=Unwrap with sound');
const np = await page.locator('.now-playing').innerText({ timeout: 8000 }).catch(() => null);
console.log(np ? `✓ music plays in the story: "${np.replace('Now playing: ', '')}"` : '• no music for this user (none of their titles has audio yet)');
await page.waitForTimeout(1500);
await shot('admin-preview');

console.log(errors.length ? `✗ page errors:\n${errors.join('\n')}` : '✓ no page errors');
await browser.close();
