#!/usr/bin/env node
/**
 * Fake Jellyfin + Jellystat + Seerr for end-to-end testing of the real integration code
 * (preparation pipeline, login, artwork caching) without touching real services.
 *
 *   node scripts/fake-upstreams.mjs            # listens on :8099
 *
 * Also fakes Deezer (DEEZER_API_URL=http://localhost:8099/deezer) and Jellyfin theme songs,
 * with synthesized audio whose previews are excerpts from 35% into each track.
 *
 * Point the app at it (e.g. in .env.development.local):
 *   JELLYFIN_URL=http://localhost:8099/jellyfin   JELLYFIN_API_KEY=fake-jellyfin-key
 *   JELLYSTAT_URL=http://localhost:8099/jellystat JELLYSTAT_API_KEY=fake-jellystat-key
 *   SEERR_URL=http://localhost:8099/seerr         SEERR_API_KEY=fake-seerr-key
 *
 * Users (password = username): alice (admin), bob, carol, dave, erin (very light viewer).
 * Endpoints, auth headers and response shapes mirror the real APIs (Jellyfin 10.11/12,
 * Jellystat 1.1.x, Seerr). All titles are fictional.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.FAKE_PORT ?? 8099);
const KEYS = { jellyfin: 'fake-jellyfin-key', jellystat: 'fake-jellystat-key', seerr: 'fake-seerr-key' };
const NOW = Date.now();
const YEAR = new Date(NOW).getUTCFullYear();

// ------------------------------------------------------------------ deterministic data
let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hex = (s) => crypto.createHash('md5').update(s).digest('hex');

const GENRES = ['Drama', 'Comedy', 'Science Fiction', 'Thriller', 'Animation', 'Documentary', 'Crime', 'Fantasy', 'Horror', 'Romance', 'Mystery', 'Family'];
const ACTORS = ['Marisol Vance', 'Theo Okafor', 'June Halvorsen', 'Ravi Castellanos', 'Ines Moreau', 'Dmitri Koval', 'Saoirse Bell', 'Kenji Arata', 'Lena Quist', 'Omar Haddad', 'Priya Nair', 'Felix Brandt'];
const MOVIE_TITLES = ['Paper Comets', 'Glass Harbor', 'The Last Lighthouse Keeper', 'Midnight Velocity', 'Honey & Thunder', 'Arcadia Drive', 'Fog Over Kestrel', 'Copper Sky', 'The Quiet Orchard', 'Neon Saints', 'Low Tide Letters', 'Starling Road', 'The Ninth Window', 'Ash & Velvet', 'Small Hours', 'Kingdom of Moths', 'Second Sunrise', 'The Cartographer', 'Polar Drift', 'Saltwater Hymn', 'The Long Con', 'Ember Station', 'Wild Clover', 'Paperweight', 'Orbit Café', 'The Understudy', 'North of Nowhere', 'Silver Thread'];
const SERIES_TITLES = ['The Salt Kingdom', 'Night Shift at Orbit 9', 'Bakers of Brindle Lane', 'Static & Smoke', 'The Long Thaw', 'Velvet Precinct', 'Tidepool', 'Hollow Creek', 'Signal Lost', 'Garden of Foxes'];

const movies = MOVIE_TITLES.map((title, i) => ({
	Id: hex(`movie${i}`),
	Name: title,
	Type: 'Movie',
	ProductionYear: i % 5 === 0 ? 1980 + i : 2005 + (i % 21),
	RunTimeTicks: (85 + Math.floor(rnd() * 70)) * 60 * 10_000_000,
	Genres: [pick(GENRES), pick(GENRES)].filter((g, j, a) => a.indexOf(g) === j),
	People: Array.from({ length: 5 }, (_, k) => {
		const name = ACTORS[(i * 3 + k * 5) % ACTORS.length];
		return { Name: name, Id: hex(`person:${name}`), Role: `Character ${k + 1}`, Type: 'Actor', PrimaryImageTag: hex(`tag:${name}`).slice(0, 8) };
	}),
	ProviderIds: i === 7 ? {} : { Tmdb: String(1000 + i), Imdb: `tt${String(9000000 + i)}` },
	ImageTags: { Primary: hex(`img${i}`).slice(0, 8) },
	BackdropImageTags: [hex(`bd${i}`).slice(0, 8)],
	tmdbPopularity: i % 6 === 0 ? 1.2 + rnd() * 3 : 8 + rnd() * 180,
	deleted: i === 3 || i === 11 // removed from Jellyfin, still in history
}));

const series = SERIES_TITLES.map((title, i) => {
	const id = hex(`series${i}`);
	const seasons = 1 + (i % 3);
	const episodes = [];
	for (let s = 1; s <= seasons; s++) {
		const n = 6 + ((i + s) % 5) * 2;
		for (let e = 1; e <= n; e++)
			episodes.push({ Id: hex(`ep${i}-${s}-${e}`), Name: `Episode ${e}`, Type: 'Episode', SeriesId: id, SeriesName: title, SeasonId: hex(`season${i}-${s}`), ParentIndexNumber: s, IndexNumber: e, RunTimeTicks: (22 + (i % 3) * 20) * 60 * 10_000_000 });
	}
	return {
		Id: id,
		Name: title,
		Type: 'Series',
		ProductionYear: 2010 + i,
		Genres: [GENRES[i % GENRES.length], GENRES[(i + 4) % GENRES.length]],
		People: Array.from({ length: 6 }, (_, k) => {
			const name = ACTORS[(i * 2 + k * 3) % ACTORS.length];
			return { Name: name, Id: hex(`person:${name}`), Role: `Role ${k}`, Type: 'Actor', PrimaryImageTag: hex(`tag:${name}`).slice(0, 8) };
		}),
		ProviderIds: { Tmdb: String(5000 + i), Tvdb: String(70000 + i) },
		ImageTags: { Primary: hex(`simg${i}`).slice(0, 8) },
		BackdropImageTags: [],
		episodes,
		tmdbPopularity: 5 + rnd() * 120,
		deleted: i === 9
	};
});

const users = ['alice', 'bob', 'carol', 'dave', 'erin'].map((name, i) => ({
	Id: hex(`user:${name}`),
	Name: name.charAt(0).toUpperCase() + name.slice(1),
	login: name,
	Policy: { IsAdministrator: i === 0, IsDisabled: false, IsHidden: false },
	PrimaryImageTag: null,
	LastActivityDate: new Date(NOW - i * 86400000).toISOString()
}));

// ------------------------------------------------------------------ playback history
const PERSONAS = {
	alice: { days: 0.85, hours: [21, 22, 23, 0, 1], tv: 0.85, binge: [3, 8] },
	bob: { days: 0.6, hours: [18, 19, 20], tv: 0.25, binge: [1, 2] },
	carol: { days: 0.45, hours: [13, 14, 15, 16], tv: 0.6, binge: [2, 4], weekends: true },
	dave: { days: 0.5, hours: [6, 7, 8], tv: 0.5, binge: [1, 3] },
	erin: { days: 0.01, hours: [20], tv: 0.5, binge: [1, 1] }
};
const rows = [];
let rowSeq = 1;
const yearStart = Date.UTC(YEAR, 0, 1);
for (const u of users) {
	const p = PERSONAS[u.login];
	const progress = new Map(); // series id -> next episode index
	for (let day = yearStart; day < NOW - 3600_000; day += 86400000) {
		const wd = new Date(day).getUTCDay();
		const chance = p.weekends ? (wd === 0 || wd === 6 ? 0.95 : 0.2) : p.days;
		if (rnd() > chance) continue;
		let t = day + pick(p.hours) * 3600000 + Math.floor(rnd() * 50) * 60000;
		if (rnd() < p.tv) {
			const s = series[Math.floor(Math.pow(rnd(), u.login === 'alice' ? 2.2 : 1.2) * series.length)];
			let idx = progress.get(s.Id) ?? 0;
			const count = p.binge[0] + Math.floor(rnd() * (p.binge[1] - p.binge[0] + 1));
			for (let k = 0; k < count; k++) {
				const ep = s.episodes[idx % s.episodes.length];
				idx++;
				const rt = ep.RunTimeTicks / 10_000_000;
				const dur = Math.round(rt * (0.88 + rnd() * 0.12));
				if (rnd() < 0.04) rows.push(row(u, s, ep, t, 25)); // accidental start
				if (rnd() < 0.08) {
					// paused mid-episode and resumed after a break → two rows
					const a = Math.round(dur * 0.4);
					rows.push(row(u, s, ep, t, a));
					t += a * 1000 + 20 * 60000;
					rows.push(row(u, s, ep, t, dur - a));
					t += (dur - a) * 1000;
				} else {
					rows.push(row(u, s, ep, t, dur));
					t += dur * 1000;
				}
				t += Math.floor(rnd() * 12) * 60000; // short break
			}
			progress.set(s.Id, idx);
		} else {
			const m = movies[Math.floor(Math.pow(rnd(), 1.5) * movies.length)];
			const rt = m.RunTimeTicks / 10_000_000;
			rows.push(row(u, null, m, t, Math.round(rt * (0.9 + rnd() * 0.1))));
		}
	}
}
// A few rows imported from the Playback Reporting plugin (timestamp = start)
for (let i = 0; i < 10; i++) {
	const m = movies[i];
	const start = yearStart + (10 + i) * 86400000 + 20 * 3600000;
	const r = row(users[1], null, m, start, Math.round(m.RunTimeTicks / 10_000_000 * 0.95));
	r.ActivityDateInserted = new Date(start).toISOString();
	r.imported = true;
	rows.push(r);
}
rows.sort((a, b) => Date.parse(a.ActivityDateInserted) - Date.parse(b.ActivityDateInserted));

function row(u, s, item, start, seconds) {
	return {
		Id: crypto.randomUUID ? hex(`row${rowSeq++}`) : String(rowSeq++),
		IsPaused: false,
		UserId: u.Id,
		UserName: u.Name,
		Client: 'Jellyfin Web',
		DeviceName: 'Firefox',
		NowPlayingItemId: s ? s.Id : item.Id,
		NowPlayingItemName: item.Name,
		EpisodeId: s ? item.Id : null,
		SeasonId: s ? item.SeasonId : null,
		SeriesName: s ? s.Name : null,
		PlaybackDuration: seconds,
		ActivityDateInserted: new Date(start + seconds * 1000).toISOString(), // END time (live rows)
		PlayMethod: 'DirectPlay',
		imported: false
	};
}

// ------------------------------------------------------------------ seerr requests
const requests = [];
let reqId = 1;
const reqUsers = users.slice(0, 4);
for (let i = 0; i < 16; i++) {
	const u = reqUsers[i % reqUsers.length];
	const isMovie = i % 3 !== 0;
	const target = isMovie ? movies[(i * 5) % movies.length] : series[(i * 3) % series.length];
	requests.push({
		id: reqId++,
		status: i === 5 ? 3 : 2,
		createdAt: new Date(yearStart + (5 + i * 12) * 86400000).toISOString(),
		updatedAt: new Date(yearStart + (6 + i * 12) * 86400000).toISOString(),
		type: isMovie ? 'movie' : 'tv',
		is4k: false,
		media: {
			id: 100 + i,
			mediaType: isMovie ? 'movie' : 'tv',
			tmdbId: Number(target.ProviderIds.Tmdb ?? 1007),
			tvdbId: isMovie ? null : Number(target.ProviderIds.Tvdb),
			status: 5,
			jellyfinMediaId: target.Id,
			jellyfinMediaId4k: null
		},
		requestedBy: { id: reqUsers.indexOf(u) + 1, displayName: u.Name, jellyfinUserId: u.Id, jellyfinUsername: u.login },
		seasons: []
	});
}
// Movie #7 has no provider ids in Jellyfin; Seerr knows it as tmdb 1007 via jellyfinMediaId
requests.push({ ...requests[0], id: reqId++, media: { ...requests[0].media, tmdbId: 1007, jellyfinMediaId: movies[7].Id, mediaType: 'movie' }, type: 'movie' });

// ------------------------------------------------------------------ helpers
const allItems = new Map();
for (const m of movies) allItems.set(m.Id, m);
for (const s of series) {
	allItems.set(s.Id, s);
	for (const e of s.episodes) allItems.set(e.Id, e);
}

function json(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

function svg(res, label, w = 400, h = 600) {
	const hue = parseInt(hex(label).slice(0, 2), 16) * 1.4;
	res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
	res.end(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,15%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${w * 0.22}" fill="hsl(${(hue + 180) % 360},90%,60%)" opacity="0.8"/><text x="24" y="${h - 40}" font-family="Impact, Arial Black, sans-serif" font-size="${w / 9}" fill="#fff">${label.slice(0, 18).replace(/[<&>]/g, '')}</text></svg>`
	);
}

function body(req) {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (c) => (data += c));
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				resolve({});
			}
		});
	});
}

function parseMediaBrowser(header) {
	if (!header?.startsWith('MediaBrowser ')) return null;
	const out = {};
	for (const m of header.slice(13).matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = decodeURIComponent(m[2]);
	return out;
}

const userTokens = new Map();
const itemDto = ({ tmdbPopularity, deleted, episodes, login, ...rest }) => rest;

// ------------------------------------------------------------------ audio (synthesized, 8 kHz mono WAV)
/** "Music" with a seeded tempo, accents and loudness contour, so best-section matching is testable. */
function synth(seconds, seedIn) {
	let st = seedIn;
	const r = () => ((st = (st * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
	const SR = 8000;
	const bps = 1.7 + (seedIn % 9) * 0.07;
	const contour = [];
	let level = 0.6;
	for (let k = 0; k <= seconds / 2; k++) contour.push((level = Math.min(1, Math.max(0.2, level + r() * 0.3))));
	const out = new Float32Array(Math.round(seconds * SR));
	for (let i = 0; i < out.length; i++) {
		const t = i / SR;
		const beat = Math.floor(t * bps);
		const accent = 0.35 + 0.65 * (((beat * (7919 + seedIn * 31)) % 13) / 13);
		out[i] = r() * contour[Math.floor(t / 2)] * (0.12 + accent * Math.exp(-(t - beat / bps) * 9)) * 0.8;
	}
	return out;
}
function wav(samples) {
	const SR = 8000;
	const buf = Buffer.alloc(44 + samples.length * 2);
	buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
	for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
	return buf;
}
const audioCache = new Map();
function trackAudio(trackId, seconds) {
	if (!audioCache.has(trackId)) audioCache.set(trackId, synth(seconds, trackId % 100000));
	return audioCache.get(trackId);
}
/** The Deezer preview is a faded 30 s excerpt starting at 35% of the track (e2e checks this). */
const PREVIEW_AT = 0.35;
function previewAudio(trackId, seconds) {
	const full = trackAudio(trackId, seconds);
	const SR = 8000;
	const from = Math.round(seconds * PREVIEW_AT) * SR;
	const out = full.slice(from, from + 30 * SR);
	for (let i = 0; i < out.length; i++) {
		const t = i / SR;
		out[i] *= 0.7 * Math.min(1, t / 2, (30 - t) / 2);
	}
	return out;
}

// Deezer catalogue: a soundtrack album for most titles (every 4th movie has none)
const deezerAlbums = [];
const deezerTracks = new Map();
[...movies.filter((_, i) => i % 4 !== 3), ...series].forEach((t, i) => {
	const id = 700000 + i;
	const isMovie = t.Type === 'Movie';
	const album = {
		id,
		title: `${t.Name} (${isMovie ? 'Original Motion Picture Soundtrack' : 'Original Series Soundtrack'})`,
		link: `https://www.deezer.com/album/${id}`,
		cover_medium: `http://localhost:${PORT}/deezer-cover/${id}`,
		nb_tracks: 6,
		record_type: 'album',
		artist: { name: `${ACTORS[i % ACTORS.length].split(' ')[1]} Orchestra` }
	};
	deezerAlbums.push(album);
	deezerTracks.set(id, ['Main Theme', 'Opening', 'The Chase', 'Reunion', 'Night Drive', 'End Credits'].map((name, k) => ({
		id: id * 10 + k,
		title: `${t.Name} — ${name}`,
		duration: 70 + ((id + k * 13) % 50),
		rank: 900000 - k * 120000 - (i % 7) * 1000,
		track_position: k + 1,
		artist: album.artist
	})));
});
const trackById = new Map([...deezerTracks.values()].flat().map((t) => [t.id, t]));
const trackByTitle = new Map([...trackById.values()].map((t) => [t.title, t]));
// Jellyfin theme songs for every other series
const themes = new Map(series.filter((_, i) => i % 2 === 0).map((s, i) => [s.Id, { Id: hex(`theme${s.Id}`), Name: 'Theme', Type: 'Audio', RunTimeTicks: 25 * 10_000_000, seed: 4242 + i }]));
const themeById = new Map([...themes.values()].map((t) => [t.Id, t]));

// ------------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const [, service, ...rest] = url.pathname.split('/');
	const path = '/' + rest.join('/');
	const log = () => console.log(`${req.method} /${service}${path}${url.search ? '?' + url.search.slice(1, 80) : ''}`);
	log();

	// ---------------- Jellyfin
	if (service === 'jellyfin') {
		if (req.headers['x-emby-token'] || url.searchParams.has('api_key')) return json(res, 401, { error: 'legacy auth disabled (12.x)' });
		if (/^\/Items\/[^/]+\/Images\//.test(path)) return svg(res, allItems.get(path.split('/')[2])?.Name ?? 'Person');
		const auth = parseMediaBrowser(req.headers.authorization);
		if (path === '/Users/AuthenticateByName' && req.method === 'POST') {
			if (!auth?.Client || !auth.Device || !auth.DeviceId || !auth.Version) return json(res, 400, { error: 'Missing client info' });
			const b = await body(req);
			const u = users.find((x) => x.login === String(b.Username).toLowerCase());
			if (!u || b.Pw !== u.login) return json(res, 401, { error: 'Invalid username or password' });
			const token = hex(`tok${Math.random()}`);
			userTokens.set(token, u.Id);
			return json(res, 200, { User: itemDto(u), AccessToken: token, ServerId: 'fake', SessionInfo: {} });
		}
		const isKey = auth?.Token === KEYS.jellyfin;
		const isUser = auth?.Token && userTokens.has(auth.Token);
		if (!isKey && !isUser) return json(res, 401, { error: 'Unauthorized' });
		if (path === '/Sessions/Logout') {
			userTokens.delete(auth.Token);
			res.writeHead(204).end();
			return;
		}
		if (path === '/System/Info') return json(res, 200, { ServerName: 'Fake Jellyfin', Version: '12.4.0' });
		const ts = path.match(/^\/Items\/([^/]+)\/ThemeSongs$/);
		if (ts) {
			const theme = themes.get(ts[1]);
			return json(res, 200, { Items: theme ? [{ Id: theme.Id, Name: theme.Name, Type: 'Audio', RunTimeTicks: theme.RunTimeTicks }] : [], TotalRecordCount: theme ? 1 : 0 });
		}
		const au = path.match(/^\/Audio\/([^/]+)\/stream$/);
		if (au) {
			const theme = themeById.get(au[1]);
			if (!theme) return json(res, 404, {});
			res.writeHead(200, { 'Content-Type': 'audio/wav' });
			return res.end(wav(synth(25, theme.seed)));
		}
		if (path === '/Users') return json(res, 200, users.map(itemDto));
		if (path.startsWith('/Users/')) {
			const u = users.find((x) => x.Id === path.split('/')[2]);
			return u ? json(res, 200, itemDto(u)) : json(res, 404, {});
		}
		if (path === '/Items') {
			const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
			const items = ids.map((id) => allItems.get(id)).filter((it) => it && !it.deleted && !(it.SeriesId && series.find((s) => s.Id === it.SeriesId)?.deleted));
			return json(res, 200, { Items: items.map(itemDto), TotalRecordCount: items.length });
		}
		const ep = path.match(/^\/Shows\/([^/]+)\/Episodes$/);
		if (ep) {
			const s = series.find((x) => x.Id === ep[1] && !x.deleted);
			return s ? json(res, 200, { Items: s.episodes }) : json(res, 404, {});
		}
		return json(res, 404, { error: 'not found' });
	}

	// ---------------- Jellystat
	if (service === 'jellystat') {
		if (req.headers['x-api-token'] !== KEYS.jellystat) return json(res, 403, 'Invalid API key');
		if (path === '/stats/getPlaybackActivity') {
			const size = Number(url.searchParams.get('size') ?? 50);
			const page = Number(url.searchParams.get('page') ?? 1);
			let list = rows;
			const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
			for (const f of filters) {
				if (f.field === 'ActivityDateInserted') list = list.filter((r) => (!f.min || r.ActivityDateInserted >= f.min) && (!f.max || r.ActivityDateInserted <= f.max));
			}
			const pages = Math.max(1, Math.ceil(list.length / size));
			return json(res, 200, { current_page: page, pages, size, sort: 'ActivityDateInserted', desc: false, results: list.slice((page - 1) * size, page * size) });
		}
		if (path === '/api/getItemDetails' && req.method === 'POST') {
			const b = await body(req);
			const it = allItems.get(b.Id);
			if (!it) return json(res, 404, { error: 'not found' });
			const s = it.SeriesId ? series.find((x) => x.Id === it.SeriesId) : null;
			return json(res, 200, [{ Id: it.Id, Name: it.Name, Type: it.Type, ProductionYear: String(it.ProductionYear ?? s?.ProductionYear ?? ''), RunTimeTicks: String(it.RunTimeTicks ?? ''), Genres: it.Genres ?? s?.Genres ?? [], SeriesId: it.SeriesId ?? null, SeriesName: it.SeriesName ?? null, IndexNumber: it.IndexNumber ?? null, ParentIndexNumber: it.ParentIndexNumber ?? null, archived: Boolean(it.deleted || s?.deleted) }]);
		}
		return json(res, 404, { error: 'not found' });
	}

	// ---------------- Deezer (public API, no key)
	if (service === 'deezer') {
		if (path === '/search/album') {
			const q = (url.searchParams.get('q') ?? '').toLowerCase();
			const limit = Number(url.searchParams.get('limit') ?? 25);
			const words = q.replace(/\b(soundtrack|original score|theme)\b/g, '').trim();
			const data = deezerAlbums.filter((a) => a.title.toLowerCase().includes(words)).slice(0, limit);
			return json(res, 200, { data, total: data.length });
		}
		if (path === '/search/track') {
			// any song: title/artist match, else the start of the catalogue (generic music)
			const q = (url.searchParams.get('q') ?? '').toLowerCase();
			const limit = Number(url.searchParams.get('limit') ?? 25);
			const withAlbum = (t) => {
				const a = deezerAlbums.find((x) => x.id === Math.floor(t.id / 10));
				return { ...t, album: a ? { title: a.title, cover_medium: a.cover_medium } : undefined };
			};
			const all = [...trackById.values()];
			const hits = all.filter((t) => `${t.title} ${t.artist.name}`.toLowerCase().includes(q));
			const data = (hits.length ? hits : all).slice(0, limit).map(withAlbum);
			return json(res, 200, { data, total: data.length });
		}
		const at = path.match(/^\/album\/(\d+)\/tracks$/);
		if (at) return json(res, 200, { data: deezerTracks.get(Number(at[1])) ?? [] });
		const tr = path.match(/^\/track\/(\d+)$/);
		if (tr) {
			const t = trackById.get(Number(tr[1]));
			if (!t) return json(res, 200, { error: { type: 'DataException', message: 'no data', code: 800 } });
			return json(res, 200, { ...t, preview: `http://localhost:${PORT}/deezer-preview/${t.id}.wav?hdnea=exp=1~hmac=fake` });
		}
		return json(res, 200, { error: { type: 'DataException', message: 'no data', code: 800 } });
	}
	if (service === 'deezer-cover') return svg(res, `Album ${path.slice(1)}`, 250, 250);
	if (service === 'deezer-preview') {
		const t = trackById.get(Number(path.slice(1).replace(/\.wav$/, '')));
		if (!t) return json(res, 404, {});
		res.writeHead(200, { 'Content-Type': 'audio/wav' });
		return res.end(wav(previewAudio(t.id, t.duration)));
	}
	// Test helper: the "full track" an admin would upload, looked up by Deezer track title.
	if (service === 'fake-full') {
		const t = trackByTitle.get(decodeURIComponent(path.slice(1)));
		if (!t) return json(res, 404, {});
		res.writeHead(200, { 'Content-Type': 'audio/wav', 'X-Expected-Start': String(Math.round(t.duration * PREVIEW_AT)) });
		return res.end(wav(trackAudio(t.id, t.duration)));
	}

	// ---------------- Seerr
	if (service === 'seerr') {
		const img = path.match(/^\/imageproxy\/tmdb\/t\/p\/\w+\/(.+)$/);
		if (img) return svg(res, decodeURIComponent(img[1]).replace(/\.\w+$/, ''));
		if (req.headers['x-api-key'] !== KEYS.seerr) return json(res, 403, { message: 'Unauthorized' });
		if (path === '/api/v1/status') return json(res, 200, { version: '3.5.1' });
		if (path === '/api/v1/request') {
			const take = Number(url.searchParams.get('take') ?? 10);
			const skip = Number(url.searchParams.get('skip') ?? 0);
			return json(res, 200, { pageInfo: { pages: Math.ceil(requests.length / take), pageSize: take, results: requests.length, page: Math.floor(skip / take) + 1 }, results: requests.slice(skip, skip + take) });
		}
		const mv = path.match(/^\/api\/v1\/(movie|tv)\/(\d+)$/);
		if (mv) {
			const id = Number(mv[2]);
			const src = mv[1] === 'movie' ? movies.find((m) => Number(m.ProviderIds.Tmdb) === id || (id === 1007 && m === movies[7])) : series.find((s) => Number(s.ProviderIds.Tmdb) === id);
			if (!src) return json(res, 404, { message: 'not found' });
			const common = {
				id,
				posterPath: `/${encodeURIComponent(src.Name)}.jpg`,
				backdropPath: `/${encodeURIComponent(src.Name)}-bd.jpg`,
				popularity: src.tmdbPopularity,
				genres: src.Genres.map((g, i) => ({ id: i, name: g === 'Science Fiction' && mv[1] === 'tv' ? 'Sci-Fi & Fantasy' : g })),
				credits: { cast: src.People.map((p, i) => ({ id: 900 + ACTORS.indexOf(p.Name), name: p.Name, character: p.Role, profilePath: `/${encodeURIComponent(p.Name)}.jpg`, order: i })) },
				externalIds: { imdbId: src.ProviderIds.Imdb ?? null, tvdbId: src.ProviderIds.Tvdb ? Number(src.ProviderIds.Tvdb) : null }
			};
			if (mv[1] === 'movie') return json(res, 200, { ...common, title: src.Name, releaseDate: `${src.ProductionYear}-05-01`, runtime: src.RunTimeTicks / 600_000_000 });
			const seasons = {};
			for (const e of src.episodes) seasons[e.ParentIndexNumber] = (seasons[e.ParentIndexNumber] ?? 0) + 1;
			return json(res, 200, { ...common, name: src.Name, firstAirDate: `${src.ProductionYear}-01-10`, episodeRunTime: [40], seasons: Object.entries(seasons).map(([n, c]) => ({ seasonNumber: Number(n), episodeCount: c })) });
		}
		if (path === '/api/v1/search') {
			const raw = url.search.match(/query=([^&]*)/)?.[1] ?? '';
			if (/[:\/?#\[\]@!$&'()*+,;=]/.test(raw)) return json(res, 400, { message: 'query must be url encoded' });
			const q = decodeURIComponent(raw).toLowerCase();
			let results = [];
			const imdb = q.match(/^imdb:(tt\d+)/);
			const tvdb = q.match(/^tvdb:(\d+)/);
			if (imdb) results = movies.filter((m) => m.ProviderIds.Imdb === imdb[1]).map((m) => ({ id: Number(m.ProviderIds.Tmdb), mediaType: 'movie', title: m.Name }));
			else if (tvdb) results = series.filter((s) => s.ProviderIds.Tvdb === tvdb[1]).map((s) => ({ id: Number(s.ProviderIds.Tmdb), mediaType: 'tv', name: s.Name }));
			else {
				const term = q.replace(/year:\d{4}\s*/, '').trim();
				results = [
					...movies.filter((m) => m.Name.toLowerCase().includes(term)).map((m) => ({ id: Number(m.ProviderIds.Tmdb ?? 1007), mediaType: 'movie', title: m.Name })),
					...series.filter((s) => s.Name.toLowerCase().includes(term)).map((s) => ({ id: Number(s.ProviderIds.Tmdb), mediaType: 'tv', name: s.Name }))
				];
			}
			return json(res, 200, { page: 1, totalPages: 1, totalResults: results.length, results });
		}
		return json(res, 404, { message: 'not found' });
	}
	json(res, 404, { error: 'unknown service' });
});

server.listen(PORT, () => {
	console.log(`Fake upstreams on http://localhost:${PORT} — ${rows.length} playback rows, ${requests.length} requests, ${users.length} users`);
});
