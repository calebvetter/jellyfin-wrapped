# ARCHITECTURE

This file covers individual features and areas of the app. Read only the section you need; don't read the whole file unless you're doing a broad refactor. Search it by section heading or keyword.

For rules that apply to every task, see [AGENTS.md](AGENTS.md). Always read that file in full first.

## How to use this file

- Each `##` section below covers one feature or area of the app.
- When you build a new feature or materially change an existing one, add or update its section here.
- Keep sections self-contained so each can be searched and read on its own.

---

## Overview & Layout

SvelteKit 2 (Svelte 5 runes) + TypeScript, `adapter-node`, GSAP. There are two halves with a hard boundary between them:

- **Preparation** (`src/lib/server/prep/`) turns upstream data into JSON `WrappedReport`s, which are stored in SQLite.
- **Presentation** (`src/lib/story/`) only renders a `WrappedReport`. It never computes statistics.

The contract between them is `src/lib/shared/report.ts`, imported as `$shared/report`.

```
src/lib/server/           server-only code
  config.ts               env parsing (all credentials come from env, never from the DB/UI)
  db/                     node:sqlite wrapper + append-only migrations
  crypto.ts               tokens, keyed hashes, AES-GCM, HMAC signing
  auth/session.ts guard.ts
  integrations/           jellyfin.ts jellystat.ts seerr.ts http.ts
  prep/                   time normalize aggregate personality requests resolve report runner
  artwork.ts soundtrack.ts analytics.ts links.ts reports.ts viewer.ts admin.ts
src/lib/shared/           report.ts (schema + slide order/labels), soundtrack.ts (cue plan, slide durations), clock.ts (viewer-timezone clock)
src/lib/story/            Story player, slides/, audio, tracker, Gate, Backdrop, Poster, Emblem
src/lib/mock/             mock report for /preview
src/routes/               / (login)  /wrapped  /w/[token]  /preview  /admin/**  /art /audio  /api/**
scripts/                  devserver, screenshots, fake-upstreams, e2e-admin, contact-sheet.py
```

## Integrations

**Deezer** (public, keyless) and Jellyfin theme songs are described under *Soundtrack & Audio*.

These facts were verified against the upstream sources, and the fakes in `scripts/fake-upstreams.mjs` mirror them. Keep the fakes in sync when an integration changes.

**Jellyfin** (10.11 and 12.x; 12.0 is the successor of 10.11):
- Use only `Authorization: MediaBrowser Client=…, Device=…, DeviceId=…, Version=…, Token=…`. Legacy `X-Emby-*` and `api_key` auth is disabled by default in 12.x.
- Login is `POST /Users/AuthenticateByName` with a **random DeviceId per login**. Reusing a DeviceId logs out that user's other session on the same device.
- The returned token is logged out immediately (`POST /Sessions/Logout`). The app keeps its own session and re-checks permissions with the API key (`GET /Users/{id}`).
- Bulk metadata: `GET /Items?ids=…&fields=Genres,People,ProviderIds,ChildCount,PremiereDate`. No `userId` is needed with an API key; send at most 100 ids per call.
- Image endpoints are anonymous.

**Jellystat** (header `x-api-token`):
- History comes from `GET /stats/getPlaybackActivity`. Rows are flat, filtered by `ActivityDateInserted`, sorted ascending and paged by 2,000.
- **`ActivityDateInserted` is the session END time** for live rows (`start = end − PlaybackDuration`). Rows with `imported=true`, which come from the Playback Reporting plugin, carry the START time.
- `PlaybackDuration` is in seconds, with pauses excluded.
- For episodes, `NowPlayingItemId` is the **series** id and `EpisodeId` is the episode id.
- `POST /api/getItemDetails {Id}` returns archived (deleted) items: name, year, genres, runtime. It has no provider ids.

**Seerr** (header `X-Api-Key`, base `/api/v1`):
- Requests: `/request?take=100&skip=…&filter=all&sort=added`. Users are mapped via `requestedBy.jellyfinUserId`.
- `/movie/{id}` and `/tv/{id}` provide `popularity`, cast (`profilePath`), genres and season sizes.
- `/search` supports the prefixes `imdb:tt…`, `tvdb:…` and `year:YYYY …`. Query values must be strictly percent-encoded: no `+`, and `!'()*` must be escaped too (see `encodeSeerrQuery`).
- Artwork goes through Seerr's anonymous `/imageproxy/tmdb/t/p/<size>/<path>`, falling back to image.tmdb.org.

All user and item ids are normalized with `normId` (lowercase, no dashes).

## Data Preparation Pipeline

The pipeline is orchestrated by `prep/runner.ts`. Only one run executes at a time, progress is held in memory and mirrored to `datasets.progress`, and the run can be cancelled.

1. Sync Jellyfin users into the `users` table. Only users with `users.included = 1` (the checkboxes on the Users page, migration 5; new users default to included) get a report. The log says "Preparing Wrappeds for X of Y users".
2. Fetch Jellystat rows for `[yearStart − 1d, rangeEnd + 1d]`. The window is padded because insert time is the end time.
3. Fetch Seerr requests. These also give a map from `jellyfinMediaId` to TMDb id.
4. `resolve.ts` resolves metadata for every played id. The details are in the next section.
5. Map rows to `PlaybackRecord`s, then `normalize.buildViews`.
6. Per user, `report.buildReport` produces the report plus the full `stats` shown to admins. Requests and Good Taste come from `requests.ts`.
7. Publish atomically: in one transaction, point `active_datasets(year)` at the new dataset, mark the old one `superseded` and delete its reports.
   - If the run fails or is cancelled, the new dataset's reports are deleted and the live dataset is untouched.
   - Runs interrupted by a restart are marked failed on boot.
8. After publishing, every user with a report who has no active share link gets one (`createLink`), so links are never a separate step. Existing links are kept.

The range is local Jan 1 → local Jan 1 of the next year, or → now for the current year (year to date). Timezone handling is in `prep/time.ts`: Intl-based, with offsets cached per UTC hour.

**Preparation timezones** (`server/timezone.ts`; there is no env setting):
- **Default:** `settings.timezone`, chosen on the admin dashboard. `lib/admin/TimezonePicker.svelte` is a shadcn-style combobox with no dependency: a button shows the selection, and a popover holds an empty search box over all of `Intl.supportedValuesOf('timeZone')` with current UTC offsets. Typing filters by words, arrow keys and Enter pick, Esc closes. It uses `aria-activedescendant`, and with `emptyLabel` a first option selects '' (`emptyShort` is the closed button's shorter text, `compact` the table-row size, `disabled` locks it; the Users page disables it for unchecked users). The popover is `position: fixed` under the trigger (or above it when there's no room), and it follows scrolling, so scrolling tables and cards can't clip it. The selection posts a hidden `timezone` field and saves on change via `?/timezone`. On the first admin page visit with nothing saved, the admin layout posts the browser's zone to `POST /api/admin/timezone`, which never overwrites a saved choice. That makes the dashboard, each user's "Default" and the server agree from the start. **Prepare** also posts the picker's value. UTC is only the fallback before any admin has visited.
- **Per user:** `users.timezone` (migration 7), set in the Users page's Timezone column (`POST /api/admin/users/timezone`, saved on pick) or on the user's page. Empty means the default. Names are stored canonically (`canonicalTimezone`).
- **In a run:** `startPreparation` computes `preparationRange(year, now, tz)` for the default and for every included user's zone, all sharing one `now`. The dataset's `range_start`/`range_end` are the widest of these, and that window is fetched from Jellystat and fed to `buildViews`. Each user's views are then trimmed to their own year (`restrictToRange`), and their report is built with their zone (`report.timezone`). Their request stats use their range too. `datasets.timezone` holds the default.

**Viewer-timezone clock** (`$shared/clock.ts`): everything is prepared in the user's preparation timezone (above), except that the time-of-day stats follow whoever is watching.
- Jellystat stores no timezone per play. Its `RemoteEndPoint` would allow a GeoIP lookup, but only if Jellyfin sees real client IPs: behind a Docker reverse proxy it records the proxy's address unless the proxy is listed in Jellyfin's *Known proxies*. So the viewer's browser zone is used instead.
- The clock slide carries `utc`, a sparse histogram of seconds per UTC half-hour per week (`buildClockHistogram`, flat `[week, halfHour, seconds]` triples from `base`).
- After mount, `Story.svelte` runs `localizeReport(report, viewerTimezone())`. This re-buckets the histogram into local hours using each week's mid-week offset, so DST is right to within a week and +5:30-style zones are handled. It recomputes the persona, window share and peak hour, and the summary's "Prime viewing" tile.
- Nothing changes when the viewer is in the report's own zone, the zone is unknown, or the report predates `utc` (re-prepare to add it). Admin previews follow the admin's browser zone.
- Days, streaks, the busiest day and binge dates stay in the user's preparation timezone. `stats.clock` on the admin user page is also in that zone.

## Metadata Resolution & Caching

`prep/resolve.ts` resolves each Jellyfin item id in this order:
1. Jellyfin `/Items`.
2. The persistent `media_cache` entry `jf:<id>`.
3. Jellystat's archive.
4. The names on the playback rows.

TMDb id resolution, in order:
1. `ProviderIds.Tmdb`
2. The Seerr request's `jellyfinMediaId`
3. Seerr `imdb:` / `tvdb:` lookup
4. Seerr title+year search, used only for items missing from the library

TMDb details are cached as `tmdb:<movie|tv>:<id>` and refreshed after 3 days. Every resolved item is written back to the cache, so deleted items keep their identity and art.

**Title keys** are `movie:tmdb:<id>` or `series:tmdb:<id>` when TMDb is known, otherwise `…:jf:<id>`. This merges re-added or duplicate library items. Episode unit keys are `<seriesKey>:s<S>e<E>`.

**Cast:** the Jellyfin cast is preferred, with missing portraits filled from TMDb. People are identified by a normalized name (`personKey`).

**Artwork** (`artwork.ts`): `ArtSource {key, urls[]}` objects are only downloaded when a report uses them (`ensureArt`). Files go to `DATA_DIR/artwork/xx/<sha256>.<ext>` and are served from `/art/<hash>` with immutable caching. A failed download is retried at most once a day, and existing files are never deleted.

## Metric Definitions (normalize / aggregate)

Every slide uses the same cleaned `View[]`.

**Cleaning** (`normalize.ts`):
- Rows under 15 s are dropped.
- Durations are capped at runtime × 1.5 + 5 min, or 5 h for movies and 3 h for episodes when runtime is unknown.
- Overlapping rows of the same unit are unioned.
- **Resumes merge** into one view while it is below 85% of runtime and the gap is ≤ 7 days, or ≤ 2 h when runtime is unknown.
- **A view counts only if meaningful:** ≥ min(5 min, max(1 min, 40% of runtime)). Accidental starts contribute nothing, including watch time.
- **Completed** means ≥ 80% of runtime.
- **Rewatch** means a view of a unit the user already completed this year.
- Views are attributed to the range by their start.
- Interval-based metrics (clock, days, binges, streaks) use `viewIntervals`, which scales segments so time-of-day totals equal watch time.

**Per-slide definitions:**

| Metric | Definition |
|---|---|
| Top shows / movies | Score = 0.7 × watch time / user max + 0.3 × plays / user max. Plays are episode plays for shows, or views including rewatches for movies. Needs ≥ 3 titles. |
| Genre DNA | Watch time split evenly across a title's normalized genres (aliases such as "Sci-Fi & Fantasy" are mapped). Top 7 + "Everything else". Needs ≥ 3 genres and ≥ 2 h. |
| You Had a Type | Ranked by distinct *meaningfully watched* titles (`meaningfulTitle`: movie ≥ 40 min or completed; series ≥ 2 episodes or ≥ 60 min) that feature the actor in their top 10 billed cast (`ACTOR_CAST_DEPTH`; deeper ensemble/bit roles don't count). Ties go to role prominence (Σ `1/(1+(billing−1)/4)`: lead roles beat ensemble parts), then watch time, then best billing. Needs ≥ 2 titles. Admin stats store a per-actor breakdown (title, role, billing, time) for auditing. |
| Binge | Same series, breaks ≤ 45 min, ranked by distinct episodes then time. Needs ≥ 3. |
| Clock | Minutes per local hour. The persona is the 4-hour window with the most minutes (windows are fixed by the brief). Follows the **viewer's** timezone, see below. |
| Busiest day | Local day with the most watch time. |
| Streak | Consecutive local days with ≥ 10 min. Needs ≥ 3. The heat grid holds per-day quartile levels. |
| Original | Lowest TMDb popularity among meaningful titles (`meaningfulTitle`). Needs ≥ 4 candidates. The percentile is against every title watched on the server (anonymous). |
| Requests / Good Taste | Distinct non-declined titles requested in range. A title counts as Good Taste if any **other** user meaningfully watched it after the request. Reports only receive counts. Posters are ordered by everyone's watch time since the request, and Good Taste titles by other users' watch time. The slide spotlights only the first Good Taste title (always given a card), and that title sets the slide's music. |
| Personality | `personality.ts`: each trait computes a strength (≥ 1 qualifies) and the strongest qualifying trait wins. If nothing qualifies, the fallback is Cinema Connoisseur or Deep Diver, needing ≥ 3 h total. Explanations quote real numbers. |

Slides without enough data are omitted, and so is any user under 30 meaningful minutes.

## Story Player

`Story.svelte` renders `report.slides` followed by a client-only outro (Rewatch).

**Interaction:**
- Tap the left 30% of the frame to go back, anywhere else to go forward.
- Hold for > 220 ms to pause. This pauses `gsap.globalTimeline` and the audio.
- Keyboard: ← → / Space / K / P / M / Home.
- The story pauses automatically when the tab is hidden.

**Transitions:** going forward is a circular clip-path reveal from the tap point; going back is a horizontal wipe. Reduced motion uses a crossfade.

**Slide timing:** durations live in `SLIDE_DURATION` in `$shared/soundtrack`. Each value is the slide's intro-animation length plus roughly 8–12 s of reading time, more for dense slides; the comments in that file record the reasoning. The outro waits for the viewer.

**Pause and navigation:** navigating (tap, key or button) while paused resumes playback. A paused `gsap.globalTimeline` would otherwise freeze the transition itself.

**Slide components** (`slides/*.svelte`, registered in `slides/registry.ts`):
- Each receives `{ slide }` and builds animation via `story().timeline(root, (tl, q) => …)`. Timelines are scoped with `gsap.context` and reverted on unmount.
- With reduced motion, finite timelines jump to their end state.
- Infinite ambient loops must be built in a **separate** `timeline()` call, so the main timeline stays finite.
- **Never put CSS `transition: transform` on GSAP-animated elements.** It fights GSAP and has left elements stuck at `scale(0)`.
- **Entrances "from off-screen"** must use `offAbove(root)`, `offBelow(root)` or `offRight(root)` from `anim.ts`, which measure the element. Fixed pixel offsets leave elements visible inside taller frames.
- **Outlined text:** Bricolage is a variable font with overlapping contours, so `-webkit-text-stroke` alone draws the overlaps inside letters. Fill the text with the background colour, double the stroke width, and set `paint-order: stroke fill`.
- **Starbursts and rays:** keep shapes inside their SVG viewBox. Size the SVG well past the frame's half-diagonal and fade it with a radial `mask-image`; anything past the viewBox gets clipped to a visible square.

**Sizing:** slides are laid out in a CSS container (`.frame`, `container-type: size`). All sizes use the design unit `--u = min(1cqw, 0.4625cqh)`:
- 1% of frame width on tall phones (the 390×844 design target).
- Scaled down on shorter frames such as the 9:16 desktop frame or 360×640.

Write `calc(N * var(--u))`, not raw `cqw`. The exception is `Poster.svelte`'s fallback, which is its own container.

**Desktop:** the frame is 9:16 with a glow in the slide's colour (`themes.ts`) over `Backdrop.svelte`, a drifting wall of the user's posters.

Each backdrop column duplicates its posters and scrolls by `translateY(-50%)`. Two rules keep the loop seamless:
- The columns are `align-items: flex-start`, i.e. content height rather than stretched, and padded by one gap, so -50% is exactly one set of posters.
- Each half is taller than the wall, including on 4K screens.

**Gate** (`Gate.svelte`): a "tap to start" screen that unlocks audio inside the gesture. Its buttons are disabled until hydration so early taps are never lost.

**Tap to reveal** (`ctx.interceptAdvance`): a slide can claim a manual "next" (tap, arrow key or side button, never auto-advance). Story asks the current layer's handler first and stays on the slide while it returns true. The handler also resumes the story if it was paused. Personality uses this. A "next" before the card has turned over starts the reveal at once: the wobble settles, the drumroll is cut with `ctx.stopSfx`, and the card turns from wherever it is (on landing, if it's still flying in). A "next" while it is still turning is ignored. After that, "next" works as usual. The reveal's elements start hidden with `gsap.set` because the reveal timeline is only built when it starts. Every sound effect plays through its own gain node so `AudioDirector.stopSfx(name)` can fade it out.

**Adding a slide:**
1. Add the type to `report.ts` and `SLIDE_ORDER` / `SLIDE_LABELS`.
2. Build it in `report.ts`.
3. Add a component plus a registry entry.
4. Add a `SLIDE_DURATION` entry (`$shared/timing.ts`), add the slide to `slideTitleKeys` in `server/music-plan.ts` if it features titles, and add mock data.

## Soundtrack & Audio

Each Wrapped is scored with music from the movies and shows that user watched. Screens that aren't about any one title can instead get **generic music** chosen by the admin (below).

**Featured titles** (`server/soundtrack.featuredTitles(reports)`): every title shown on a slide across a year's reports, weighted by role:

| Role | Weight |
|---|---|
| #1 show or movie | 3 |
| Binge series, most obscure | 2 |
| Genre pick | 1.5 |
| Top 5, actor slide, busiest day | 1 |
| Good Taste example | 0.5 |

The admin page lists them heaviest first and reports coverage. It also registers featured titles on load (`ensureTitles`), so lookups and track picks work before the next preparation.

**Finding soundtracks** (preparation step 9, `refreshSoundtracks`). This step never fails a run; problems become warnings.
- **Deezer public API, no key** (`integrations/deezer.ts`):
  - Albums are searched with `"<title> soundtrack"` plus `"… original score"` for movies or `"… theme"` for series.
  - Each candidate is scored by `scoreAlbum`. The title must appear as whole words, and a leading "The" is optional. Soundtrack and series/film wording helps. Cover, tribute, karaoke, lullaby and game albums are penalised, as are extra unrelated words. Ties go to Deezer's search order.
  - If nothing scores ≥ 3, the bare title is searched, with results capped at low confidence (< 6 shows "please confirm").
  - The chosen album's tracks are stored ordered by Deezer `rank` (popularity). These are the "tracks to grab".
  - Results live in `soundtrack_titles`: `pending | auto | confirmed | none | error`. Titles marked `none` or `error` are retried after 14 days. Admins can confirm a match, choose another candidate, search, or mark "no soundtrack".
  - Only movie and show titles are sent to Deezer, never user data. `DEEZER_ENABLED=false` turns this off; `DEEZER_API_URL` points it elsewhere (used by the fakes).
- **Jellyfin theme songs:** `GET /Items/{id}/ThemeSongs` and `GET /Audio/{id}/stream?static=true`. They are downloaded into `DATA_DIR/audio` (source `theme`, start 0) so they keep working if the library changes.

**Picking a track** (`selectTrack`, from the "Use" button or the bulk `selectTopTracks`):
- Only tracks of the title's matched album can be chosen.
- The track's **30-second Deezer preview** is downloaded from a freshly signed URL and cached in `DATA_DIR/audio` as source `deezer`, with start 0. The preview is the label-chosen hook, so no best-section detection is needed.
- Picking replaces any previous pick for the title atomically; theme songs are kept.
- If a cached file goes missing, `/audio/t/<id>` re-downloads it transparently (`restorePreview`).
- Audio is served at `/audio/t/<id>`: random ids, immutable caching and HTTP Range support.

**YouTube** (`integrations/youtube.ts`, `addYouTube`; admin pastes a link → `POST /api/admin/soundtrack/youtube`):
- **Accepted links:** `parseYouTubeId` accepts watch, youtu.be, Shorts, embed, live, music and nocookie links. The link is rebuilt as a canonical watch URL, so no arbitrary URL or option ever reaches yt-dlp, which runs via `spawn` with an argument array.
- **Download:** yt-dlp downloads the native audio stream (`bestaudio[ext=m4a]` first, AAC, which plays everywhere including Safari; otherwise webm/Opus). ffmpeg isn't needed.
  - Videos are limited to 20 minutes and 80 MB, with a 5-minute timeout.
  - Downloads run one at a time.
  - The cache lives in `DATA_DIR/.cache/yt-dlp`, which keeps the root filesystem read-only.
- **JavaScript runtime:** YouTube needs one for yt-dlp. The app passes `--js-runtimes node:<this Node binary>`; Deno is used instead if installed.
- **Finding yt-dlp:** `YTDLP_PATH`, else `yt-dlp` on PATH. A `.js`/`.mjs` path is run with Node, for fakes.
  - The Docker image installs `yt-dlp[default]` (which includes yt-dlp-ejs) in `/opt/yt-dlp`.
  - CI rebuilds the image weekly, because YouTube breaks old yt-dlp versions.
  - `ytdlpStatus()` is shown in the admin page, and the YouTube box explains how to install yt-dlp when it's missing.
- **Result:** the grab becomes the title's selection (source `youtube`, `source_url`), replacing any Deezer pick. The default segment is the whole clip if it's 30 s or shorter, otherwise 0–30 s.

**Segments** (`soundtrack_audio.start` → `segment_end`, NULL = to the end; migration 3):
- `setSegment` clamps times to the file and requires at least 1.5 s (0.05 s for sound effects, `sfx:` keys), so short clips such as 11-second stings are fine.
- Choosing the whole clip stores `segment_end = NULL`.
- In the admin, `lib/admin/SegmentEditor.svelte` provides:
  - a waveform decoded in the browser
  - draggable start and end handles, which can also be dragged together as a region
  - arrow-key nudging
  - exact time inputs
  - "Whole clip" and "Play segment", which loops like the story
- YouTube grabs always show the editor; Deezer previews and theme songs have a **Trim** toggle.
- `sfx` mode (sound effects): 0.01 s precision, 0.05 s minimum, and "Play segment" plays once instead of looping.

**Generic music** (`GENERIC_KEY = 'generic'` in `soundtrack_audio.title_key`; `music_slots` table, migration 5; card `routes/admin/soundtrack/GenericMusic.svelte`, API `POST /api/admin/soundtrack/generic`):
- A pool of tracks not tied to any title: YouTube grabs (`addGenericYouTube`) or any Deezer song's 30 s preview (`searchTracks` → `addGenericDeezer`). Adding never replaces; each is trimmed/removed individually.
- Generic YouTube grabs play **in full** until the admin clips them; the 0–30 s default applies only to title music. Migration 6 removed that automatic clip from generic tracks added earlier.
- **Slots** (`MUSIC_SLOTS` in `$shared/music.ts`): `intro`, `total-time`, `clock`, `streak`, `personality`, `summary` (also the Rewatch outro) and `fallback`. `setSlot(slot, audioId | null)` only accepts generic tracks; deleting a track clears its slots.
- In the music plan an assigned slot overrides that screen for everyone; unassigned screens behave as before. `fallback` replaces the server's most-featured tracks for users with no music of their own (it never overrides a user's own music). Disabled tracks are skipped (`slotTracks`).
- Generic tracks are background music: `toTrack` gives them an empty label, so the story shows no "now playing" pill for them.

**Sound effects** (`$shared/sfx.ts` lists them; page `/admin/sound-effects`, API `/api/admin/sfx/<name>`):
- Each is synthesized by `AudioDirector.sfx()` unless replaced. A replacement is a `soundtrack_audio` row with `title_key = 'sfx:<name>'`, source `upload` (multipart, ≤ 15 MB, audio MIME + magic-byte check) or `youtube` (JSON `{ url }`). Replacing deletes the previous row and file; `DELETE` resets to the built-in sound.
- The browser decodes uploads to report their duration (no ffmpeg on the server), so `defaultSfxSegment` can start clips longer than 5 s trimmed to 0–2 s. Admins trim with the segment editor and set volume (`gain`, 0–150%).
- The player gets `customSfx` (url, segment, gain) in its page data; after unlock `loadCustomSfx` fetches and decodes them into AudioBuffers in the background, and `sfx()` plays the buffer (honouring pitch) on its own bus, falling back to the synth until it's ready or if decoding fails.
- `BODY_SIZE_LIMIT=16M` (Dockerfile, e2e server) lets uploads through adapter-node's default 512 KB body limit.

**"No music" decision** (`setMusicOff`, migration 4 `soundtrack_titles.music_off`):
- For titles with nothing good to use, the admin can mark "Use no music for this title". This removes any picked track and makes `tracksByTitle` ignore the title's audio, including its Jellyfin theme song.
- The bulk pick and theme-song caching skip these titles.
- Slides featuring the title keep the music already playing, so the music plan falls through to the current track or hero track.
- The admin page lists the title under "No music" (alongside titles with no soundtrack found), not "Needs music".
- "Choose music after all", or picking a track or grabbing from YouTube (`replaceSelection`), clears the flag.

**Admin listening:**
- `/api/admin/soundtrack/preview/<trackId>` proxies Deezer previews, keeping the CSP same-origin.
- Play buttons have three states (▶ play / loading spinner / ■ stop) via `lib/admin/player.svelte.ts`.
- **Album covers** are cached through the artwork cache (`localCover`, Deezer's `dzcdn.net` CDN only) and served from `/art/<hash>`, because the CSP is `img-src 'self'`.

**Music plan** (`server/music-plan.ts`, a pure function built at page load so new picks apply without re-preparing):
- Each slide plays its own title's music: the #1 show on Top Shows, the #1 movie on Top Movies, the binge series, the obscure pick, the spotlit Good Taste title, and so on. On Requests, if the spotlit title has no music, the current music keeps playing. It never falls through to another poster's music, which wouldn't match the screen. With no Good Taste title, the most-watched request with music is used.
- If the music already playing belongs to one of the slide's titles, it keeps playing.
- Total watch time, the clock and the streak keep the current music.
- Personality switches to a fresh track.
- The user's **hero** track (their top title that has music) opens the story and bookends the summary and outro.
- A picked Deezer track beats the title's Jellyfin theme song.
- Users with no music of their own fall back to the generic `fallback` slot, else the server's top 3 most-featured tracks (`fallbackTracks`). Only the user's own titles plus generic/fallback tracks ever reach their page.
- Generic slots override the screens they're assigned to (see Generic music).
- The plan is `{ tracks, plan: trackId per slide }` (`$shared/music.ts`).

**Player** (`story/audio.ts` `AudioDirector`):
- Two decks (HTMLAudioElement → MediaElementSource → gain → music bus → master), both primed inside the start gesture so iOS allows later `play()` calls. Priming's muted play → pause only pauses a deck that no real `play()` has claimed since (deck `token`). Otherwise the first slide's track was paused for good whenever the following slides kept the same track (e.g. one generic track on every screen). `play()` of the track already on also resumes it if it was stopped.
- On each slide the idle deck loads the planned track, seeks to its `start`, and fades in while the other fades out over 1.6 s. Generic tracks instead resume where they were left off (`resumeAt`, saved when a deck is paused or reused), unless that is within 2 s of the segment end or the story is rewatched. Title music always restarts at its `start`. The next slide's track is preloaded on the idle deck after the crossfade.
- Only the chosen segment plays. When it reaches `end`, or the file ends, it loops back to `start` with a quick volume dip (`LOOP_FADE` 0.18 s each way), checked every 40 ms. A segment shorter than its slide, such as an 11 s clip under a 20 s slide, loops seamlessly.
- **Deferred music** (`DEFERRED_MUSIC` in `story/context.ts`: Top Shows, Top Movies): these slides open on the latest **generic** track before them (`openingTrack`; it resumes where it left off), so the #1 show's music doesn't carry into the movies' build-up. Without generic music they keep the previous slide's track. They switch to their own when the slide's timeline calls `ctx.musicCue()`. Top Shows cues as "And your #1 show is…" appears; Top Movies cues as the #2 ticket lands. Each cue comes at least the 1.6 s crossfade before the #1 reveal. The idle deck preloads the slide's own track on entry, and after a cue it preloads the next slide's opening track. With reduced motion, the cue fires on entry.
- A "now playing" pill shows the track label for about 5 s on each change (not for generic music, which has no label).
- **iOS silent switch:** all audio runs through Web Audio, which iOS mutes in silent mode. While sound is on, `navigator.audioSession.type = 'playback'` (set in `unlock()` before the context is created, and on unmute) makes it follow the volume buttons like a media app; `destroy()` resets it to `'auto'`. Browsers without the Audio Session API ignore it.
- Sound effects are synthesized or admin-replaced (see Sound effects); setting `sfx_enabled` turns them all off. Mute is stored in localStorage.

The old mood-segment system (`audio_tracks`, cue sheets) was removed in migration 2. Orphaned audio files are deleted on startup (`cleanupOrphanAudio`).

## Authentication & Sessions

- `/` signs in with Jellyfin credentials, with login throttling per client IP.
- Sessions use a random 256-bit cookie `jw_session` (HttpOnly, SameSite=Lax, Secure on HTTPS). Only an HMAC of the cookie is stored, in `sessions`.
- **Authorization comes from real Jellyfin permissions:**
  - `Policy.IsAdministrator` is captured at login and re-verified every 5 min with the API key.
  - Disabled or deleted users lose their session.
  - If Jellyfin is unreachable, cached permissions are trusted for at most 1 h, after which the session fails closed.
- Route policy is in `auth/guard.ts` and enforced in `hooks.server.ts`:
  - `/admin/**` and `/api/admin/**` are admin-only.
  - `/wrapped` requires a signed-in user.
  - `/w/*` uses a bearer token.
  - `/art`, `/audio` and `/email` are public assets.
- `safeNext` prevents open redirects.
- CSRF: SvelteKit checks the origin of form actions, and hooks reject cross-origin non-GET `/api/*` calls. Admin API calls also require an `Origin` header. **Production requires `ORIGIN`**: without it adapter-node assumes https and rejects form posts.
- Security headers are set on every response: strict CSP (hash mode, via `svelte.config.js`), `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, and `no-store` on pages. `robots.txt` disallows everything.

## Share Links

`server/links.ts`, route `/w/[token]`. A link is a **public, view-only** page of one user's prepared Wrapped, safe to share: it creates no session, reaches no other page, setting or user, and never touches Jellyfin, Jellystat or Seerr. The page data is the report (with `userId` blanked), its music and sound-effect URLs (this app's `/audio`, `/art`), and an analytics token for that visit. Links are created automatically by preparation (pipeline step 8). Admins copy them with **Copy link** on the Users page, and replace ("New link") or revoke them on the user page. There is no separate links page.

- **Token:** 8 characters, bit.ly-sized, from a 56-character alphabet without look-alikes (no 0/O, 1/l/I), drawn with `crypto.randomInt` (`linkCode`, about 46 bits). With the per-IP throttle below, guessing a valid code is hopeless.
- **Legacy tokens:** links made before short codes were 43-char base64url. `TOKEN_RE` still accepts them, and at startup `shortenLegacyLinks()` gives each such user a newer short link (the one admins copy) while the old one stays valid. A new link or a revoke ends both.
- **Storage:**
  - Lookup uses `tokenHash(token,'link')`, an HMAC with a key derived from `APP_SECRET`.
  - For the admin "Copy" action, the token is stored AES-256-GCM encrypted (`token_enc`).
  - The plaintext never touches logs, and `redactPath` masks `/w/<token>` in access logs.
- **Lifecycle:**
  - One current link per user (plus, transitionally, a legacy long one); "New link" revokes the old ones.
  - Links persist across restarts and re-preparation until revoked.
  - Links are bound to the user, not the year: they open the featured year, and `?year=` works for that user's other prepared years.
- **Access scope:** read-only view of that one user's prepared report(s), plus an analytics token. No session, no admin access, no other users, no upstream services.
- **Hardening:**
  - Malformed tokens are rejected before the DB lookup.
  - Failed lookups count toward a per-IP throttle (20 per 10 min, then HTTP 429).
  - Unknown tokens get a generic 404.

## Engagement Analytics

`server/analytics.ts`, `story/tracker.ts`, `/api/events`, `/admin/analytics`.

- Real viewers (signed-in or link) get a **tracking token** binding user, year, mode and slide count for 12 h. It's AES-GCM encrypted (`encrypt`, claims `t:'track'`), not just signed, so public share-link pages don't reveal the Jellyfin user id. Admin previews and the mock preview get no token, so they are never recorded.
- **What the client sends:** per-slide deltas (enters, dwell ms excluding paused/hidden time, skips, revisits), plus furthest slide, completion, rewatches and active time.
  - It flushes on navigation (at most every 8 s), every 20 s, on completion, and via `sendBeacon` on hide/pagehide. This handles abandoned sessions.
  - A skip is a forward tap before 50% of the slide's duration.
  - A revisit is re-entering a slide within the same pass; Rewatch starts a new pass.
  - Completion means reaching Year in Review.
- **Identity:**
  - A visit is one page load.
  - A session is a per-tab id in sessionStorage with a 30-min idle window, so reloads stay one session.
  - A device is a localStorage id.
  - Session and device ids are stored only as HMACs. No IP addresses or user agents are stored.
- **Server-side validation:** the server validates ids, clamps all numbers, and refuses to attach events to another user's visit.
- **Drop-off:** a visit counts as dropped on a slide when it is incomplete, its furthest slide is that one, and it has had no activity for 30 min.

## Persistence

There is one SQLite file, `DATA_DIR/wrapped.db`, run in WAL mode through `node:sqlite` (no native addons). Migrations are append-only in `db/migrations.ts`.

| Table(s) | Contents |
|---|---|
| `settings` | `featured_year`, `sfx_enabled` |
| `sessions`, `users`, `links` | Sign-in sessions, synced users (`included`: gets a Wrapped on the next preparation; `timezone`), share links |
| `datasets`, `active_datasets`, `reports` | Prepared data and which dataset is live per year |
| `media_cache`, `artwork` | Metadata and artwork cache |
| `view_visits`, `view_slides` | Engagement analytics |
| `soundtrack_titles` | Deezer soundtrack match per title: status, chosen album, candidates, popularity-ranked tracks, and `music_off` (admin confirmed no music) |
| `soundtrack_audio` | Playable audio per title: the picked Deezer preview (`deezer`) or YouTube grab (`youtube`, with `source_url`), and cached Jellyfin theme songs (`theme`). Also generic music (`title_key = 'generic'`) and replaced sound effects (`sfx:<name>`, sources `upload`/`youtube`). Each has a segment (`start` → `segment_end`) |
| `music_slots` | Generic track assigned to each music slot (intro, finale, fallback, …) |

Other files in `DATA_DIR`: `artwork/`, `audio/`, and `.app-secret` (generated only if `APP_SECRET` is unset).

## Admin Panel

The admin pages live in `src/routes/admin/**` with the shared stylesheet `src/lib/admin/admin.css`.

| Route | Purpose |
|---|---|
| `/admin` | Preparation. Polls `/api/admin/prep` every second while a run is active. Also connection tests and the featured year. |
| `/admin/users` | User list, synced from Jellyfin. Checkboxes (with check all/none) choose who gets a Wrapped (`POST /api/admin/users/include`); **Copy link** copies each user's share link, and **Copy email** copies a ready-to-send email (see below) |
| `/admin/users/[id]` | Full stats, link management, engagement |
| `/admin/preview/[id]` | Uses `+page@.svelte` to escape the admin shell |
| `/admin/analytics` | Engagement analytics |
| `/admin/soundtrack` | Generic music card, then featured titles with their soundtrack match and popularity-ranked tracks (preview, **Use**, bulk pick). Mutations go through `/api/admin/soundtrack/*`. |
| `/admin/sound-effects` | Sound effects on/off, and per effect: play built-in / yours, upload or YouTube replace, trim, volume, reset |

Mutations are SvelteKit form actions (CSRF-protected).

**"Wrapped is ready" email** (`lib/admin/email.ts`, Users page **Copy email**):
- `wrappedEmail()` builds the subject, an HTML body (tables and inline styles only, 600 px, light card) and a plain-text alternative. The HTML has a banner, a greeting, a lime "Unwrap my <year>" button linking to the share link, three feature icons, a sound tip, the admin's name as sign-off, and the raw link as a fallback. The copy is deliberately short.
- `copyRich()` writes `text/html` + `text/plain` with `navigator.clipboard.write`. Where that's unavailable (plain-http LAN), it falls back to a `copy` event via `execCommand('copy')`. Pasting into Gmail, Outlook or Apple Mail keeps the formatting.
- Images are absolute URLs to `static/email/` (`banner.jpg` 1200×560, `icon-*.png` 160 px) on the current origin, because pasted emails can't carry attachments and most clients block `data:` images. The page warns when the origin is private (`isPrivateOrigin`), since recipients couldn't load them. `/email/*` is a public asset in `auth/guard.ts`.
- The images were rendered with Playwright from HTML using the app's fonts (Bricolage Grotesque *standard* file, which has the width axis, plus Instrument Serif) and brand colours. They don't include a year, so they never need re-rendering.

**Admin layout on phones:** the shell grid uses `minmax(0, 1fr)` and `.grid.cols-2` uses `minmax(min(320px, 100%), 1fr)`, so content can't widen the page. Under 640 px every admin `table` scrolls sideways on its own. On the Users page the Stats/Preview and Copy link/Copy email pairs may stack below 1440 px, so the table fits without scrolling.

## Deployment & CI

**Package manager:** pnpm (`pnpm-lock.yaml`). CI uses `pnpm/action-setup`, which reads the version from `packageManager`.

**Dockerfile:**
- The app is built once on `$BUILDPLATFORM`, giving platform-neutral JS output.
- **pnpm**, pinned via `packageManager` and installed globally in each stage.
- A per-target `deps` stage runs `pnpm install --prod --config.node-linker=hoisted`, which produces a flat, copyable `node_modules` of pure-JS runtime deps. Arm64 builds therefore need no emulated compilation.
- Runtime: `node:24-alpine`, tini, python3 with yt-dlp in a venv (`/opt/yt-dlp`, symlinked to `/usr/local/bin/yt-dlp`), the non-root `node` user, `/data` as a volume, a `HEALTHCHECK` on `/api/health`.

**docker-compose.yml:** pulls the image from GHCR (`ghcr.io/${GHCR_OWNER:-calebvetter}/jellyfin-wrapped`; the GHCR package must be public for anonymous pulls), uses `env_file: .env`, and runs with a read-only root filesystem and `no-new-privileges`.

**`.github/workflows/docker-publish.yml`:**
- Runs tests and `svelte-check`, then a buildx multi-arch build (amd64 + arm64) with the GHA layer cache.
- Pushes to `ghcr.io/<owner>/jellyfin-wrapped` using `GITHUB_TOKEN`.
- Tags: `latest` on main, `sha-<short>` and `sha-<long>`, and semver on `v*` tags.
- A weekly scheduled run (Mondays) rebuilds `latest` so yt-dlp stays current.

## Dev Tooling

- `scripts/devserver.mjs` manages a persistent background Vite server (state in `.dev/`).
  - On Windows it launches through PowerShell `Start-Process` (internal `__child` mode) so the server doesn't inherit the caller's console or pipe handles. Without that, `pnpm dev:start | …` hangs.
  - It stops servers with `taskkill /T`.
- `scripts/fake-upstreams.mjs` is an API-faithful fake of Jellyfin (including theme songs), Jellystat, Seerr and Deezer. It generates deterministic users with distinct viewing personas, plus deleted items, imported rows, resumes, accidental starts and requests. Its previews are synthesized audio.
- `scripts/e2e-admin.mjs` is a Playwright end-to-end smoke test. It covers: sign-in, prepare (including soundtrack lookups), stats, link, anonymous playback with analytics, bogus token, picking a soundtrack track (preview cached, served with Range), grabbing a short YouTube clip with the real yt-dlp and saving an 11 s segment (`--yt <url>`, or `--yt skip` offline), music playing in a user's story, and every admin page.
- `scripts/e2e-server.sh` runs it against an isolated production build on port 3300 with its own `./data-e2e`, so it never touches your real config or data:

  ```bash
  pnpm build
  bash scripts/e2e-server.sh &
  node scripts/fake-upstreams.mjs &
  node scripts/e2e-admin.mjs --base http://127.0.0.1:3300
  ```
- `scripts/screenshots.mjs` captures every slide from `/preview?slide=N&hold=1`. Flags: `--sizes mobile,small,desktop`, `--slides`, `--query`, `--reduced`, `--gate`. `scripts/contact-sheet.py` tiles the screenshots for review.
- Mock data: `src/lib/mock/mockReport.ts`, served at `/preview` (enabled by `MOCK_PREVIEW`), with generated SVG art at `/preview/art/*`. Variants: `variant=light` (sparse viewer) and `variant=heavy` (80 days of watch time, to exercise long day-pill rows).
- **README screenshots** (`docs/screenshots/*.jpg`) come from `/preview` (mock data only, never real users) with the "Mock preview" badge hidden (`.badge{display:none}`) and the browser in `America/Chicago`, the mock's timezone. They are mobile 390×844 at 2×, downscaled to 540 px wide, plus one desktop 1440×900 Year in Review shot, all as JPEG at quality 84. Re-take them when slides change visibly.
