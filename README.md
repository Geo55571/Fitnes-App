# FORM — mobile fitness tracker

Expo (SDK 57) · React Native 0.86 · TypeScript · Expo Router · three.js via expo-gl · zustand ·
SQLite key-value storage · Cloudflare Workers + Durable Objects (accounts and group sync).

Local-first: logging, goals, progress and settings work fully offline on the device. Signing in
to group sync adds shared groups, invite codes, live leaderboards and member profiles.

## Run it

```bash
npm install
npx expo start          # press a (Android), i (iOS simulator on macOS), or scan the QR code with Expo Go
npx expo start --web    # browser preview — use the device toolbar at phone size
```

Every native module used is included in Expo Go (expo-gl, expo-sqlite, expo-notifications,
expo-file-system, expo-sharing, expo-document-picker, expo-haptics), so no development build is needed.

Checks:

```bash
npm run typecheck       # tsc --noEmit
npx expo lint
npm test                # 84 tests (incl. the OCR number/unit/date parser): goals, units, time zones/DST, trends, backups, storage, reminders, sync engine, photo scans
npm run test:db         # 32 checks of the database privacy rules, run on in-process Postgres (PGlite)
```

## Deploy (web, Cloudflare Pages)

Live: **https://form-fitness-9zk.pages.dev** (Pages project `form-fitness`).

```bash
npx wrangler login      # once, or set CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) for a token with "Cloudflare Pages: Edit"
npm run deploy          # expo export → scripts/prepare-pages.mjs → wrangler pages deploy
```

`scripts/prepare-pages.mjs` is required: Cloudflare's uploader skips folders named `node_modules`,
which is where Expo puts the icon fonts, so it moves them to `assets/vendor/` and rewrites the references.
The page template (`public/index.html`) sizes the app to the visible screen on phones, respects
notches, disables pull-to-refresh and double-tap delay, and adds an installable web manifest.
The account server is deployed separately: see Accounts and group sync.

## What's in the app

| Area | What it does |
|---|---|
| **Today** | The **streak flame**: days in a row with a workout, evolving from Ember to Legend; tap it for streak, days missed and best streak. Trackers open **quick-add** (+1/+5/+10 reps, plank stopwatch, "log same as last time"). Daily and weekly goals, upcoming plan. |
| **Scan (camera button)** | The round camera button in the middle of the tab bar opens the camera. Photograph your Apple Watch workout summary (or long-press to choose a Fitness-app screenshot) and the workout is **read on the device**: type, time, distance, calories, heart rate, elevation and start time. Clear summaries are added automatically; anything uncertain opens a filled-in **Check and save** form. Already-logged workouts are skipped, and **Undo** / **Edit** are right there. Optional **on-device AI** recognizes any workout type by name (Settings → Photo reading). |
| **Read text (on-device OCR)** | Scan screen → **Read text on this device**. Take or choose a photo; text and numbers are recognized **on the device** (nothing is uploaded, works offline): full text with outlines on the photo, numbers with units (72.4 kg, 25 km/h, 93 %, €19.99, 12:43, −5.5 °C), dates, confidence, **Copy text**. Accurate / Fast modes. |
| **Log** | Strength, cardio, bodyweight, any number of sessions per day, past days, edit/delete. **Start from** the last session or a saved **routine**, **plank stopwatch**, **rest timer** between sets (alerts in the background on phones), **custom exercises**. |
| **Plan** | Calendar with per-day status (including days with activity but no goals) and what was logged on the selected day. Daily, some-days, one-day and **weekly** goals, to-dos, goals that **raise themselves** after a strong week (history keeps old targets), and **suggested goals** from your last four weeks. |
| **Progress** | This week vs the same days last week, 7-day / 30-day / 13-week charts, **trend lines** (est. 1-rep max, running pace, cycling speed, best set, longest hold), **sets per muscle group** vs your 4-week average, personal bests, history. |
| **Groups** | Create/join with invite codes, challenges with metric + dates, leaderboards, member profiles (Today / Yesterday / Last week) that respect each person's sharing level. **Invite links**, and the **main challenge**: an overall 0–100 rating across all challenges. Accounts need only a name and a password. |
| **Winter Arc 2026/27** | A built-in personal challenge, Oct 1, 2026 – Feb 1, 2027 (124 days): healthy nutrition, 30 min reading and a private discipline rule every day; 2–4 strength and 1–2 endurance workouts every calendar week. **Daily check-in** (under 20 s), weekly view, full-season **calendar heatmap**, **THE ARC** (the season as one 124-tick dial), streaks, perfect days/weeks, approved exceptions and rule breaks kept apart, and a deterministic **Discipline Score** (0–100) with its full breakdown. Every day can be edited later. Entirely manual and on-device (never synced). Open it from Groups, or from Today once joined. Logic: `src/domain/winterArc.ts`. |
| **Settings** | Account & sync, units, time zone, **smart notifications**, privacy, avatar, trackers, sample data, **backup & export**, erase data. |

### Notifications (iOS/Android)
Each can be switched on separately; the text is recomputed from your data whenever it changes.
- **Goal reminder** — in the evening, exactly what's left ("3 push-ups and 2 km run to go today"); skipped when you're done.
- **Streak protection** — 20:30, only if nothing is logged today and a 3+ day streak would end.
- **Challenge finish** — on a challenge's last day: your rank and how far behind the leader you are.
- **Weekly summary** — Sunday 19:00.
- "Someone passed you" appears in the app after a sync. It isn't a push notification (that would need a server-side job).

### Data and backups
- Quantities are stored canonically (meters, kilograms, seconds) and converted only for display.
- Every total is computed from saved sessions (`src/domain`), so trackers, goals, charts and leaderboards can't disagree.
- History is stored **one record per month** in an on-device SQLite key-value store (browser storage on web), so large histories stay fast and within platform limits. Older single-record saves migrate automatically on first launch.
- **Backup & export** (Settings → Data): a full JSON backup (shared to Files/Drive/mail), restore by **merge** or **replace** with a preview first, and a CSV of every set, run and hold for spreadsheets.
- Sample data (setup or Settings → Sample data) is labelled **Sample** everywhere and removable in one step. It is never uploaded.

## Reading workout photos on the device (OCR + interpreter + on-device AI)

The camera button reads photos entirely on the device:

1. **OCR** — text lines with positions (see the OCR section below).
2. **Interpreter** (`src/domain/workoutInterpreter.ts`) — finds the workout's name and each label
   ("Workout Time", "Distance", "Active Kilocalories", "Avg. Heart Rate", German/Serbian/Spanish variants…),
   picks the value next to or below it (also side-by-side columns), checks units, fixes OCR look-alikes
   (O→0, l→1), and places unlabelled values by unit. Instant, offline, on every platform.
3. **On-device AI** (web, optional, `src/ai/index.web.ts`) — Qwen2.5-1.5B running on the GPU through WebGPU
   (WebLLM). When the workout's name isn't one the interpreter knows ("Zumba", "Leg day", "Trčanje na traci"),
   it decides the type, in any language. Its answer is grammar-constrained to the list of types. One-time
   download (~880 MB) from the official MLC model repository on request in **Settings → Photo reading**,
   then kept in the browser and used offline. Photos and text never leave the device.
4. The result goes through the same checks as before (`planScan`: plausible ranges, units, dates, duplicates).
   A clear summary (workout name and time read cleanly) is saved straight away, with Undo/Edit. Anything less
   certain — a photo of the live workout view (only an icon, no name), glare, blur, missing values — opens
   **Check and save**: a form filled with what was read, every value editable, missing ones empty. A photo with
   no readable numbers offers **Enter it yourself** instead of a dead end.

The live Apple Watch views (Pacer, Metrics, Heart Rate Zones…) show no workout name, so:

- **Workout icon** (website): `src/ocr/icons.ts` finds the round badge in the screen's top-left corner, cuts
  out the figure in it and compares it (overlap of 32×32 masks) with reference icons taken from Apple's own
  screenshots on support.apple.com (`src/ocr/iconTemplates.ts`: run, indoor run, cycle, pool swim, walk, rowing,
  strength). On test photos the right icon scores 0.81–0.94 and the best wrong one at most 0.55; anything
  unclear is ignored rather than guessed.
- **Clues** otherwise: "LAPS", "/100 m" → swim; "/500 m" → rowing; "MPH", "km/h" → cycling; stride and
  ground contact → run; and the pace itself — up to 9:00 /km (14:29 /mi) is a run, slower a walk (or a hike
  with elevation). Clues only count on a screen with workout numbers, so a document isn't taken for a ride.
- **Which time is the workout's**: a stopwatch-style time ("27:04.32", "0:35:12") wins, so does a time that
  matches distance × average pace; the watch's clock — a plain time, small, top right — is skipped.
  "23:53 TIME IN ZONE" and rolling/current paces are never taken for the workout time.
- **Paces** written the Apple way ("8'37"", even "837"" when OCR loses the apostrophe) are understood; a
  pace without a unit uses the screen's unit (MI/KM) or the user's. When the distance itself wasn't read,
  it is worked out from time ÷ average pace (or average speed × time) and marked as worked out in the form.
- Values printed above their labels ("152" over "ACTIVE KCAL"), stopwatch hundredths, meters as pool
  distance, times cut in two on tilted photos, and OCR slips ("1378PM" → 137 BPM, "8.4M|" → 8.4 MI,
  "31:12:25" → 31:12.25) are handled too.

A live view with a recognized icon, a stopwatch time and one more value read directly is saved at once
(with Undo); anything less opens **Check and save**.

Tested on Apple's screenshots of the Outdoor Run (Pacer and Heart Rate Zones views), Outdoor Cycle and Hiking
views, the same photographed off a monitor (tilt, blur, noise), and users' photos of a run and a pool swim.

Why the AI only classifies names: measured on real screens in the browser, 0.5–1.5B models were unreliable at
reading whole summaries (wrong time conversions, invented values, missed workouts), while the interpreter read
them correctly. Naming the workout type is where they help: 23/30 unknown names right on their own, and with
the interpreter's dictionary handling known names the combination got about 28/30.

Phones (native build) use OCR + interpreter; a local language model there would need WebGPU or a native runtime
(e.g. Apple Foundation Models on iOS 26) and isn't included yet.

## Workout photos — optional cloud reader

Off by default (Settings → Photo reading → "Cloud reading if this device can't"). When switched on, and only if
the device couldn't read a photo, the app sends a downsized photo (≤1600 px JPEG) to `POST /api/analyze`, a Cloudflare Pages Function
(`functions/api/analyze.ts`) that asks Claude to read the summary and returns structured JSON. The app then checks
every value (plausible ranges, units, dates, duplicates — `src/domain/workoutScan.ts`) before saving.
Until a key is set the endpoint answers "not configured" and the app offers manual logging.

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name form-fitness   # paste a key from console.anthropic.com
npm run deploy                                                               # secrets apply to new deployments
```

- Model: `claude-opus-5-5` by default (set `ANALYZE_MODEL` to change). If it declines a photo, the API
  automatically retries on a fallback model (`fallbacks: "default"`).
- Each scan is one API call billed to your key. The endpoint is public, so anyone with the site's URL can use it.
  Set a monthly spend limit in the Anthropic console, or put the site behind Cloudflare Access.
- Local test with the functions: `npm run preview` with `ANTHROPIC_API_KEY=...` in a `.dev.vars` file (git-ignored).
- Phone app: set `EXPO_PUBLIC_ANALYZE_URL` to the deployed site's `/api/analyze` (see `.env.example`).
- Privacy: photos aren't stored. Calories and heart rate are kept on the device and never uploaded to group sync.
- Any other AI can be plugged in: the endpoint just has to return the `ScanReading` JSON shape.

## On-device text recognition (OCR)

Reads text and numbers from a photo without any network access.

| Where | Engine | Notes |
|---|---|---|
| iPhone | Apple Vision `VNRecognizeTextRequest` | `.accurate` / `.fast` levels, per-line confidence and boxes, EXIF orientation |
| Android | Google ML Kit Text Recognition (Latin), **bundled model** | Engine + model ship inside the app (≈12.6 MB per CPU architecture, uncompressed): works offline from the first launch |
| Website | Tesseract 5 (WebAssembly) in a Web Worker | Served from this site's `/ocr` (copied by `scripts/copy-web-engines.mjs`), cached in the browser after first use |

Pipeline (`src/ocr/`): pick image → downsize to ≤2048 px (≤1280 px in Fast) and re-encode upright →
engine → lines with confidence + bounding boxes → `src/domain/ocrParser.ts` extracts numbers (both `.` and `,`
decimals, thousands groups, signs), units, percentages, money, times/durations and dates, keeping the raw text of each.

- Photos of a screen (website engine): Tesseract struggles with light text on a dark screen surrounded by a
  bright watch strap or table, so `src/ocr/imagePrep.ts` finds the dark screen, crops it, flips it to
  dark-on-light (using each pixel's brightest colour channel, so yellow, green and red watch text come out
  as strong as white), stretches the contrast and reads it as sparse text.
- Watch layout reader (`src/ocr/layout.ts`): Tesseract's own layout analysis breaks on a big value with a
  small two-line label beside it ("8'37"" + "AVERAGE / PACE"): it splits the value at the apostrophe and
  glues the label to it. So the screen is also read our way — blobs of ink grouped into runs of one size,
  the pace's ' and " marks kept with their digits by shape, each run read alone at the ideal height — and
  each value is joined with its label lines ("8'37" AVERAGE PACE"). The sparse reading repairs values the
  layout read lost a piece of and fills gaps.
- If those find fewer than three confidently read lines with numbers (or no whole time or workout unit),
  backup passes read the whole photo (normal, then opposite brightness) and the readings are merged.
  A watch photo takes about 1.5–2 s.
- The phone engines live in a local Expo module, `modules/form-ocr` (Swift + Kotlin). **Expo Go can't load it**:
  build the app with `npm run android` / `npm run ios` (= `expo run:*`, needs Android Studio / Xcode) or `eas build`.
  In Expo Go the screen explains this instead of crashing.
- Fast mode is meant for a future live-camera mode: on iOS it switches Vision to `.fast`; ML Kit has one mode,
  so on Android and the web Fast means a smaller image.

## Accounts and group sync (FORM sync server)

Accounts are just a **name and a password** — no email. Names are unique (ignoring case); passwords are
stored as salted PBKDF2 hashes; repeated wrong passwords are slowed down. **Remember me** keeps you logged
in on that device; otherwise the login lasts until the tab or app closes.

The server is a Cloudflare Worker with one SQLite-backed Durable Object (`server/src/index.ts`): accounts,
groups with invite codes, challenges, challenge totals and shared workouts. The website reaches it through
its own `/api/sync` (`functions/api/sync.ts`, a Pages service binding called `SYNC`), so the Worker has no
public URL of its own.

```bash
npm run dev:server     # local server on http://127.0.0.1:8799
EXPO_PUBLIC_SYNC_URL=http://127.0.0.1:8799 npx expo start --web   # app against the local server
npm run deploy:server  # deploy the Worker (token needs "Workers Scripts: Edit")
```

After the first server deploy, the Pages project needs the binding once: `wrangler.jsonc` →
`"services": [{ "binding": "SYNC", "service": "form-sync" }]`, then `npm run deploy`.

**Invite links**: every shared group has a link like `https://form-fitness-9zk.pages.dev/join/ABC234`.
Opening it joins the group at once when logged in; otherwise the code is kept while you create an account
(the account name also completes onboarding), and you join right after.

How sharing works (enforced by the server):

| Your Privacy setting | Group-mates can see |
|---|---|
| All activity | your name, sessions from the last 35 days, challenge totals |
| Challenge results only | your name and challenge totals |
| Private | your name only |
| "Show me on leaderboards" off | your total is hidden from others (you still see it) |

Profiles, totals and workouts are only readable by people who share a group with you. Calories and heart
rate never leave the device. The app syncs on login, a few seconds after every change, when it comes back
to the foreground, and every 2 minutes while open.

### Main challenge (overall rating)

Everyone in your groups gets an **overall rating from 0 to 100**: in each running challenge (or a group's
latest finished one) the leader scores 100 and everyone else their share of the leader's total; your rating
is the average over your challenges (`src/domain/rating.ts`). It's shown on top of the Groups tab and
updates with every sync.

### Streak

Today shows a **streak flame**: days in a row with a workout. A streak through yesterday stays alive until
today ends. The flame grows and evolves — Ember, Spark (1), Flame (3), Blaze (7), Inferno (14), Blue fire
(30), Cosmic (60), Legend (100). Tap it for a see-through circle with the streak, days missed since your first
workout, best streak and workout days; tap the flame again to close (`src/domain/streak.ts`,
`src/components/StreakFlame.tsx`).

## Project layout
```
src/app/            routes — tabs: index, log, plan, groups, progress; stack: session, goal, group, challenge,
                    member, profile, settings, account, backup, avatar, trackers, welcome, scan, ocr
src/components/     UI kit, character/ (3D avatar, model loader, rig), session editor, quick-add, timers, charts
src/domain/         pure logic + tests: types, exercises, units, dates, metrics, goals, trends, reminders, backup, groups
src/store/          persisted zustand store, monthly chunked storage (+ tests), defaults
src/sync/           API client, accounts (name + password), sync engine (+ tests with a fake server), group operations, invite links
server/             the sync server: Cloudflare Worker + SQLite Durable Object
src/scan/           camera / photo picker, downsizing, AI reader client, scan → save pipeline
src/ocr/            on-device OCR service: image prep, engines (native module / Tesseract on web), result model
src/ai/             on-device AI (web: WebLLM on WebGPU; phone: not available) — classifies workout names
modules/form-ocr/   local Expo native module: Apple Vision (iOS) and ML Kit (Android) text recognition
functions/api/      Cloudflare Pages Function: analyze.ts reads workout photos with Claude
src/sample/         removable sample data
supabase/           database migration and its privacy tests
assets/models/      avatar models (see CREDITS.md)
```

## Credits
Avatar characters: **Ultimate Modular Men / Women Packs by Quaternius** — CC0 (public domain).
Converted to GLB with unused animations removed; see `assets/models/CREDITS.md`.

## Known limits
- Verified in the browser at 320–430 px widths, and by building the Android and iOS production bundles. Not yet run on a physical device or native simulator: check the 3D avatar, keyboard behaviour and notifications there first. If the 3D model can't load on a device, the avatar falls back to the built-in procedural figure.
- Group sync is tested with a fake server (engine tests) and end to end with two browsers against the local Worker (accounts, invite link, join, challenge, ranking, remember me).
- There is no password reset (no email by design): a forgotten password means a new account.
- Notification text is refreshed whenever the app's data changes. If the app isn't opened for days, reminders still fire, but they describe the plan from the last time it was open.
