# Jellyfin Wrapped

A Spotify Wrapped–style, story-format year in review for every user on your Jellyfin server. It shows bold kinetic typography, posters and portraits, GSAP animation, and a soundtrack made from the movies and shows each person watched. The slides are built from **Jellystat** playback history, **Jellyfin** metadata and **Seerr** requests/TMDb data.

- **Intro + 13 slides + Rewatch:**
  1. Total watch time
  2. Top 5 shows
  3. Top 5 movies
  4. Genre DNA
  5. You Had a Type
  6. Just One More Episode
  7. Viewing-time personality
  8. Busiest day
  9. Longest streak
  10. You're an Original
  11. You Requested It / Good Taste
  12. Watching personality
  13. Year in Review
- **Story interaction:** tap left/right to navigate, hold to pause, progress bars, keyboard support, reduced-motion support.
- **Mobile-first:** full-screen on phones. On desktop the story sits in a 9:16 frame over a drifting poster wall.
- **Two ways in:** Jellyfin sign-in (admins land in the admin panel), or unguessable passwordless personal links.
- **Admin panel:**
  - Prepare any year, including year-to-date, with an atomic dataset swap
  - Progress and data-completeness reporting
  - Full per-user statistics and an exact preview of each user's Wrapped
  - Choose who gets a Wrapped; personal links are created automatically
  - Engagement analytics
  - A soundtrack list built from the movies and shows people watched (Deezer previews or YouTube clips), plus generic music for the screens that aren't about one title
  - Replaceable sound effects (upload a file or grab one from YouTube)
- **Single Docker container** with SQLite, multi-arch images on GHCR.

> Everything in a Wrapped is prepared ahead of time. Playing it never recalculates statistics or calls Jellyfin, Jellystat or Seerr.

---

## Contents

1. [Requirements](#requirements)
2. [Local development](#local-development)
3. [Configuration](#configuration)
4. [Production deployment (Docker)](#production-deployment-docker)
5. [Using the admin panel](#using-the-admin-panel)
6. [Troubleshooting](#troubleshooting)
7. [Testing](#testing)

## Requirements

| | Version |
|---|---|
| Node.js (development) | **22.13+** (24 recommended); uses the built-in `node:sqlite` |
| pnpm | **10.x** (pinned via `packageManager` in package.json) |
| Jellyfin | 10.11.x or 12.x |
| Jellystat | 1.1.x, with an API key |
| Seerr / Jellyseerr / Overseerr | Optional, but enables requests, TMDb popularity and deleted-title recovery |
| Docker (production) | Any recent engine; images for `linux/amd64` and `linux/arm64` |

## Local development

```bash
pnpm install
cp .env.example .env.development.local    # fill in your home-server URLs + API keys
pnpm dev:start                          # persistent dev server with hot reload
```

| Command | What it does |
|---|---|
| `pnpm dev:start` | Start Vite in the background with hot reload, listening on all interfaces. Prints local and LAN URLs. |
| `pnpm dev:stop` | Stop it (kills the whole process tree). |
| `pnpm dev:restart` | Restart. Needed after changing `.env*` files. |
| `pnpm dev:status` | PID, health and URLs. |
| `pnpm dev:logs` | Last 80 log lines. `pnpm dev:logs -f` follows the log. |
| `pnpm dev` | Foreground alternative (Ctrl+C to stop). |

The dev server keeps its PID and log in `.dev/`. The default port is 5173; set `DEV_PORT` to change it.

**Testing on your phone.** `dev:status` prints `Network:` URLs such as `http://192.168.0.107:5173`. Open one on a phone on the same LAN.
- If it doesn't load, allow Node.js through your firewall for private networks.
  - Windows: accept the Defender prompt, or run `New-NetFirewallRule -DisplayName "Vite dev" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow` in an admin PowerShell.
- Signing in over plain HTTP on the LAN works in development. Cookies only use `Secure` on HTTPS.

**Mock preview, no integrations needed.** Open `http://localhost:5173/preview`. This renders the complete experience from fictional mock data with generated artwork.

| Query parameter | Effect |
|---|---|
| `?slide=4&hold=1` | Jump to a slide and freeze its auto-advance |
| `?variant=light` | A light viewer, with several slides omitted |
| `?variant=heavy` | A very heavy viewer (80 days of watch time) |
| `?noart=1` | Typographic poster fallbacks instead of artwork |
| `?personality=tastemaker` | Preview any watching personality |
| `?name=Sam` | Change the viewer's name |

Mock preview is on by default in development and off in production (`MOCK_PREVIEW`).

**End-to-end test against fake services.** This exercises the real integration, preparation, sign-in, link and soundtrack code without touching your server, your `.env.development.local`, or your `data/`. It uses an isolated production build on port 3300 with its own `./data-e2e`:

```bash
pnpm build
node scripts/fake-upstreams.mjs &   # fake Jellyfin + Jellystat + Seerr + Deezer on :8099 (users alice…erin, password = name)
bash scripts/e2e-server.sh &        # the app on http://127.0.0.1:3300, wired to the fakes
node scripts/e2e-admin.mjs --base http://127.0.0.1:3300
```

The run signs in, prepares (checking personal links are created, and that unchecked users are skipped), plays a story anonymously through a link, records analytics, picks a soundtrack track (caching its preview), adds generic music, replaces and resets a sound effect, and checks music plays in the story.

Separate development and production configuration:
- `.env.development.local` is read by the dev server only.
- `.env` is used by Docker Compose.
- Both are gitignored. Only `.env.example` is committed.

## Configuration

All credentials and URLs come from **environment variables**. The admin UI never edits them. Every variable is listed and explained in [.env.example](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | yes | Sign-in, users and permissions, metadata, artwork |
| `JELLYSTAT_URL`, `JELLYSTAT_API_KEY` | yes | Playback history |
| `SEERR_URL`, `SEERR_API_KEY` | recommended | Requests, Good Taste, TMDb popularity, cast and art for deleted titles |
| `DEEZER_ENABLED` | optional | `false` disables soundtrack lookups on the public Deezer API (default on; no key; only movie/show titles are sent) |
| `YTDLP_PATH` | optional | Path to yt-dlp for "grab audio from YouTube" (default: `yt-dlp` on PATH; preinstalled in the Docker image). For development: `winget install yt-dlp`, `brew install yt-dlp` or `pip install "yt-dlp[default]"`. |
| `APP_SECRET` | recommended | 32+ chars. Encrypts link tokens. If unset, a secret is generated into `DATA_DIR`. |
| `ORIGIN` | **production** | The public URL, e.g. `https://wrapped.example.com`. Without it, sign-in is rejected (CSRF protection). |
| `WRAPPED_TIMEZONE` | recommended | IANA timezone for days, hours and year boundaries |
| `ADDRESS_HEADER`, `XFF_DEPTH` | behind proxy | Real client IP, used for rate limiting |
| `JELLYSTAT_IMPORTED_TZ` | optional | Zone of Playback-Reporting rows imported into Jellystat |

## Production deployment (Docker)

### Pull the published image

Every push to `main` builds and publishes a multi-arch image to GitHub Container Registry. The workflow is [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml). It only uses the repository's `GITHUB_TOKEN`, so no registry secrets need to be configured.

| Tag | Meaning |
|---|---|
| `ghcr.io/<owner>/jellyfin-wrapped:latest` | Newest build of `main` |
| `ghcr.io/<owner>/jellyfin-wrapped:sha-<short>` / `sha-<full-sha>` | Immutable, one per commit |
| `ghcr.io/<owner>/jellyfin-wrapped:1.2.3` | Pushed `v1.2.3` tags |

New GHCR packages start private. Either make the package public (GitHub → your profile → Packages → jellyfin-wrapped → Package settings), or `docker login ghcr.io` on your server with a personal access token that has `read:packages`.

### Run with Compose

```bash
cp .env.example .env          # fill in URLs, keys, APP_SECRET, ORIGIN, WRAPPED_TIMEZONE
# set GHCR_OWNER=<your github user/org> in .env (or edit the image: line)
docker compose pull && docker compose up -d
docker compose logs -f
```

What the container provides:
- It listens on port 3000, mapped to host `${WRAPPED_PORT:-3000}`.
- All state lives in the `wrapped-data` volume (`/data`): SQLite DB, cached artwork, cached soundtrack previews and theme songs, and the generated secret.
- It runs as a non-root user with a read-only root filesystem.
- It has a Docker `HEALTHCHECK` against `GET /api/health`.

To update: `docker compose pull && docker compose up -d`. Personal links, sessions and prepared data survive restarts and upgrades.

To build locally instead of pulling: `docker compose up -d --build`.

**Backups:** back up the `wrapped-data` volume, e.g. `docker run --rm -v jellyfin-wrapped_wrapped-data:/data -v "$PWD":/backup alpine tar czf /backup/wrapped.tgz /data`.

### Behind a reverse proxy

Set `ORIGIN` to the exact public URL. If you want rate limiting to see real client IPs, also set `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`.

Caddy:

```caddy
wrapped.example.com {
	reverse_proxy jellyfin-wrapped:3000
}
```

nginx:

```nginx
server {
	server_name wrapped.example.com;
	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
```

The app sends `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, a strict CSP and `Cache-Control: no-store` on all pages. It does not log personal-link tokens. Don't enable proxy access logs that record full URLs for `/w/*`, or redact that path in them.

## Using the admin panel

Sign in at `/` with a **Jellyfin administrator** account. Admin status is read from Jellyfin and re-checked every few minutes. Ordinary users who sign in go straight to their own Wrapped.

1. **Preparation** (`/admin`)
   - **Test connections**, then **Prepare** a year. The current year means January 1 → now.
   - Progress, log, errors and data completeness are shown live. Completeness covers rows used and skipped, items recovered from Jellystat's archive, TMDb matches and users with enough data.
   - Re-running builds a new dataset and swaps it in atomically. If a run fails, the previous dataset stays live.
   - Every prepared user automatically gets a passwordless **personal link** (existing links are kept). Treat links like passwords.
2. **Users** lists everyone on your Jellyfin server.
   - **Checkboxes** (with check all/none in the header) choose who gets a Wrapped. Only checked users are prepared, and only they get a link.
   - The green **Copy link** button on the right copies a user's personal link.
   - Click a name for their prepared statistics in full (personality scores, actors, binges, every watched title), and to regenerate or revoke their link. **Preview** shows their exact Wrapped; previews are excluded from analytics.
3. **Engagement** shows, per user and year:
   - views vs. unique sessions vs. devices
   - completion and furthest slide
   - rewatches and time spent
   - per-slide reach, average time, skip rate, revisits and drop-off
4. **Soundtrack**: every movie and show that appears in this year's Wrappeds, ordered by how much its music would be heard.
   - **Generic music:** for screens that aren't really about one title (intro, total watch time, the clock, streak, personality, the finale), add tracks from YouTube or any Deezer song and choose where each plays. Unassigned screens keep each person's own music. You can also pick what plays for users who have no music of their own.
   - **Soundtrack lookup:** during preparation, each title is matched to its soundtrack album on Deezer (no key needed; only titles are sent). Each title lists its tracks, **most popular first**. Preview any track (▶ 30s), then click **Use** to pick it.
   - **What gets played:** the chosen track's 30-second Deezer preview, which is the song's hook, is cached on this server and plays instantly.
   - **Bulk pick:** one button uses the most popular track for every title still without music. You can change any of them afterwards.
   - **YouTube:** paste any YouTube link (video, Short or youtu.be) into a title's YouTube box and click **Grab audio**. The server downloads the audio with yt-dlp; the Docker image includes it.
     - Choose the part to play by dragging the handles on the waveform, typing exact times, or clicking **Whole clip**. Then **Save segment**.
     - Short clips are fine: anything shorter than a slide loops smoothly.
     - Deezer previews and theme songs can be trimmed the same way.
   - **Theme songs:** Jellyfin theme songs on your server are used automatically when no track is chosen.
   - **Fixing matches:** confirm or change a match, search Deezer yourself, or mark "no soundtrack".
   - **No music:** nothing good for a title? Click **Use no music for this title**. It moves to the "No music" tab and its slides keep the music already playing. **Choose music after all** undoes it.
   - **In the story:** each slide plays music from the title it features: your #1 show's theme on Top Shows, the binge series on the binge slide, and so on. It crossfades between tracks and shows the song name.
5. **Sound effects**: the whooshes, pops and ticks under the animations. Turn them all off, or replace any one: **Upload a file** (up to 15 MB) or paste a YouTube link, then trim it to the exact moment (to the hundredth of a second) and set its volume. **Reset to default** brings back the built-in sound.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `dev:start` says the port is in use | Another dev server is running. Run `pnpm dev:status` / `dev:stop`, or set `DEV_PORT`. |
| Dev server exits during startup | Check `pnpm dev:logs`. Usually a syntax error or a missing `pnpm install`. |
| Phone can't reach the dev server | Use the `Network:` URL. Allow Node through the firewall (see above). Make sure both devices are on the same subnet or VPN. |
| `.env` changes not picked up | `pnpm dev:restart` (env is read at startup). |
| Sign-in returns 403 in production | `ORIGIN` is missing or doesn't exactly match the URL in the browser (scheme, host and port). |
| "Couldn't reach Jellyfin" at sign-in | `JELLYFIN_URL` must be reachable **from the server or container**. In Docker, `localhost` means the container itself; use the host's LAN IP or the service name. |
| Preparation fails on Jellystat | Check that the API key works: `curl -H "x-api-token: KEY" $JELLYSTAT_URL/stats/getPlaybackActivity?size=1`. |
| Titles show as "Unknown" or lack art | The item was deleted and couldn't be matched. Configure Seerr so deleted titles can be recovered via TMDb. Re-prepare afterwards. |
| Times of day look shifted | Set `WRAPPED_TIMEZONE`. For Playback-Reporting imports in Jellystat, also set `JELLYSTAT_IMPORTED_TZ`. Re-prepare afterwards. |
| No music | Pick tracks in **Soundtrack** (or use the bulk "most popular track" button) for the titles people watched; each Wrapped plays music for its own titles, with the server's most-featured tracks as a fallback. Browsers only play audio after the "Unwrap with sound" tap. |
| A soundtrack match is wrong | In **Soundtrack**, click **Change** on the title to pick another album, search Deezer, or mark "No soundtrack exists". You can also grab the right song from YouTube. |
| YouTube grab fails | Usually an outdated yt-dlp (YouTube changes often). Docker: pull the latest image, which is rebuilt weekly. Dev: `yt-dlp -U` or `pip install -U "yt-dlp[default]"`. Age-restricted, private and region-locked videos can't be grabbed. |
| A user sees "still in the oven" | No dataset has been prepared yet, or that user is outside the featured year. |

## Testing

```bash
pnpm test               # unit tests: aggregation, personalities, tokens, access control, sessions, analytics, Good Taste
pnpm check          # svelte-check / TypeScript
pnpm screenshots    # Playwright screenshots of every slide (mobile + desktop) from /preview → screenshots/
```

Architecture notes and design decisions live in [ARCHITECTURE.md](ARCHITECTURE.md).
