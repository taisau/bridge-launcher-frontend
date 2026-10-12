# Bridge Launcher: project memory

*Machine-readable memory for AI agents. Reorganised and pruned 2026-10-12: current-state reference first, hard-won rules next, a short dated history last. Never put this in `README.md`.*

## 1. Identity

A custom Android home screen for John's Pixel 9 Pro (Android 17), built on [Bridge Launcher](https://github.com/bridgelauncher): a native Android WebView that serves a local web project and exposes system functions to JS through a global `Bridge` object.

- **Stack**: Vite, Vue 3 (Composition API), TypeScript, Tailwind CSS v4. Platform floor Android 8 (API 24).
- **Repos**: frontend `github.com/taisau/bridge-launcher-frontend` (this folder's git remote). Native fork `github.com/taisau/launcher`, **branch `patched`, tag `v24`** (see section 7). Upstream: `bridgelauncher/launcher`, `bridgelauncher/api` (types), `bridgelauncher/api-mock`.
- **Project root** holds config JSONs and scripts; all frontend code is in `src/`.

## 2. Current state (2026-10-12)

| Part | Version | Notes |
|---|---|---|
| Frontend | `v0.6.3` | built in the ai container, delivered by Syncthing |
| APK | `v24` (`BridgeLauncher-v24.apk`, versionCode 24) | signer SHA-256 `37292fe9…`; installed and verified on the phone |
| Native source | `launcher-src/` | gitignored here, persisted on GitHub branch `patched` |

Everything below describes how it works *now*. History lives in section 11.

## 3. Repo layout

- `src/App.vue` (UI + all gestures), `main.ts` (history guard, API mock), `location.ts`, `weather.ts`, `calendar.ts`, `countdown.ts`, `storage.ts`, `vite.config.ts` (stable unhashed output names).
- Root: `folders.json`, `app_management.md` (source) → generates `custom_labels.json` + `hidden_apps.json`, `apps.json` (desktop-mock snapshot only), `ha-config.json` and `calendar-config.json` (gitignored, copied by the build), `sync-build.sh`, `verify-sync-version.sh`, `process_app_management.js`, `phone-sync/` (build output, gitignored), `launcher-src/` (native checkout, gitignored), `BridgeLauncher-v24.apk`.

## 4. Frontend behaviour (reference)

### Look
National Park variable font only, pure black `#000000`, `text-gray-300/400/500`, **everything lowercase**, extra-bold (800) for navigation and clock, roughly half-size type, no icons and no vertical lines in folders. Padding `pl-14 pt-32` pulls content toward the thumb.

### Home list (top to bottom)
1. **`1 ha`**: toggles a menu of `av` (`?server=av`) and `condo` (`?server=Condo`) `homeassistant://` deep links, with a count badge. `?server=` values are **case-sensitive** and must match the Companion app's server names.
2. **Folders** from `folders.json` (empty folders hide themselves). Subitems sort alphabetically by *displayed* label (after `custom_labels.json`). The single most-launched subitem per folder is gold `#c9a961` (`topUsedPerFolder = 1`), from local counts in `localStorage` key `app_usage_counts` (device-local; wiped by a WebView data clear).
3. **`6 ai`**: launches Termux, whose `~/.bashrc` runs `ssh ai "bash -ic nnp"` (tmux `phone` → `nn`; see the claude-code project notes at `56.50 claude-code/AGENTS`).
4. **`7 memo`**: `org.fossify.voicerecorder.debug`.

### `folders.json` entry syntax
- `com.pkg` or `com.pkg|label`: an installed app (label overrides `custom_labels.json`).
- `link:label|https://url`: opens in the **default browser** via an intent (never inside the launcher WebView).
- `pwa:label|startUrl`: launches a Firefox web app (see Launch paths). Current use: `pwa:email|https://ihasmail.taisau.tv/mail`.
- An entry whose package is not in the live app list is dropped with a `console.warn`.

### Alphabetical flyout
Hold ~100 ms on the right edge (15 px drift cancels). Fisheye wave, letters only for installed apps, haptic on activation (20 ms) and letter change (12 ms), release-to-launch for a letter's first app, sticky list until the background is tapped. Rows buzz on `touchstart` (`triggerHaptic(25, 300)`). Long-press a row opens Android's App info. The last "letter" is `bridge`: app info, settings, and the version label (tap = reload the page).

### Header
- **Clock** (ticks once per minute; tap opens Bridge settings).
- **Date + countdown**: `(249) sunday 2026-10-11`. `src/countdown.ts` counts working days to **2027-10-29** (John's retirement), skipping weekends and the PTO ranges mirrored from `6 travel/63 pto/pto.md` (source of truth), with a 5 PM cutoff (after 17:00 counting starts tomorrow).
- **Weather**: current location, then a fixed **guanajuato** line (21.015639, -101.252944). Open-Meteo, Fahrenheit, 5-minute cache, stale data is hidden.
- **Calendar** (up to 4 lines, `src/calendar.ts`): personal (john@taisau.net) gold `#c9a961`, shared (jb@taisau.net) dark red `#a13d3d`. Format `title time` or `title – 9/7`. Rules locked by the user: today only; multi-day events appear only on their first day; sorted by start, all-day first; end label = start + days − 1.

### Gestures
- **Pull-to-refresh**: engages after `pullActivationThreshold = 12` px (below that the touch is a tap, so `preventDefault` never eats clicks); `loadData(true)` bypasses every 5-minute cache. Mount, resume and app events use cached data.
- **Home gesture → Bridge app drawer**: the bottom-bar swipe cannot be intercepted, but its completion fires Bridge's `newIntent` event (the activity is `singleTask` + `CATEGORY_HOME`). `handleHomeIntent` opens the drawer only if a pause was seen within `homeIntentPauseGraceMs = 700` (already-home gesture, not "return from an app"), ignores intents during the first `homeIntentStartupIgnoreMs = 3000` after page start (cold start), and with a flyout/folder open it just closes it.
- **Back gesture**: `main.ts` keeps exactly one history guard (`history.state.bridgeGuard`) above a replaced base entry so Android's back never escapes to the system, and reloads do not grow the stack.

### Launch paths (`src/App.vue`)
- **App**: `Bridge.requestLaunchApp(pkg, false)` first (a Java call that can never navigate the WebView); fallback is an `intent://#Intent;action=MAIN;category=LAUNCHER;launchFlags=0x10000000;package=<pkg>;end` URL.
- **Web URL / HA deep link** (`fireWebUrl`): `intent://<rest>#Intent;scheme=<scheme>;action=VIEW;category=BROWSABLE;launchFlags=0x10000000;end`.
- **Firefox web app** (`fireWebApp`): `…;action=mozilla.components.feature.pwa.PWA_LAUNCHER;component=org.mozilla.firefox/mozilla.components.feature.pwa.WebAppLauncherActivity;…`. The start URL must match the manifest's resolved `start_url` exactly (iHasMail: `https://ihasmail.taisau.tv/mail`) or Firefox opens a normal tab.
- All intent URLs go through a hidden iframe (`fireIntent`), never `location.href` on the launcher document.
- **Bridge's own activities** (settings, drawer): JS API only, no intent fallback.
- UI collapse is deferred to `beforePause` so the intent is handled while the WebView is stable.

### Location
`src/location.ts` reads `ha-config.json` (`baseUrl` = the phone-local ha-proxy `http://localhost:8081`, `token`, `entityId` = the phone's `device_tracker`), reads `attributes.latitude/longitude`, then reverse-geocodes with Nominatim (`city → town → suburb → neighbourhood → hamlet → village → quarter → municipality → county`, else `"local"`, which is never cached). The entity id can drift (`pixel_9_pro` → `pixel_9_pro_2`); check the entity list when location breaks.

### Resilience
`loadData` uses `Promise.allSettled` and checks `res.ok` before `.json()`. `refreshApps()` re-reads just the app list at 2 s and 6 s after start. All external fetches have an 8 s `AbortSignal.timeout`. Weather, location and calendar are cached in `localStorage` with an `isStale` fallback.

## 5. Data and config files

- **`app_management.md`** is the source for hiding apps and renaming them. `custom_labels.json` and `hidden_apps.json` are **regenerated on every build**; never edit them. After editing the md, run the build ("process the app management list").
- **`folders.json`**: category → entries (syntax above).
- **`ha-config.json`**: private (HA token); gitignored; copied by the build.
- **`calendar-config.json`**: `{proxyUrl, user, sharedAccountName}`, **no password**; gitignored; copied by the build. JMAP account ids are resolved from `/jmap/session` by account *name* (short ids like `d`/`f` can drift).
- **`apps.json`**: desktop mock only (`npm run dev`). The phone always reads `Bridge.getAppsURL()`, so editing it never changes on-device behaviour.

## 6. Build and deploy

**Build host = the ai container** (the only place that builds the frontend or APK). The Windows workstation and the framework host must not build this project (dual builds raced through Syncthing and produced mismatched bundles).

1. Edit `src/`, then run **`bash sync-build.sh`** (the scripts lack the exec bit, so `./` fails). It processes `app_management.md`, **bumps the version itself** (single-digit rule with carry: `0.2.9` → `0.3.0`, never `0.2.10`; do not hand-bump), builds, copies the bundle plus JSONs into `phone-sync/`, and runs `verify-sync-version.sh` (benign non-zero exit when run without exec permission).
2. Syncthing mirrors the whole workspace to `/storage/emulated/0/sync` on the phone (folder id `jpy4g-ixqea`, phone Syncthing v2). The bundle lands at `/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync/`. Wait for "Up to Date" on both ends.
3. The user reloads by tapping the version label in the flyout's `bridge` section. Pull-to-refresh does **not** reload JS. The version label confirms the new bundle loaded.
4. **Always report all three versions** (`src/package.json`, `src/dist`, `phone-sync/.build-version`; they must match) and confirm **bundle coherence**: every `assets/...` referenced by `phone-sync/index.html` exists, exactly one `index.js`, no hashed leftovers, no nested `phone-sync/phone-sync/`.
5. `npm --prefix src run build` is for verification only, never the deploy step (it does not refresh `phone-sync/`).

**Fallback delivery** (Syncthing broken): `scp` to the phone's Termux sshd (`-P 8022`, tailnet `100.93.179.65`, password in `52.01 secrets`), copying `phone-sync/*` (not the directory itself).

## 7. Native APK (patched Bridge Launcher)

### Source and build
- Persisted on **`github.com/taisau/launcher`, branch `patched`, tag `v24`** (`master` is stock v8; older tags v12-v15 are incomplete). Local checkout `launcher-src/` (gitignored here and excluded from Syncthing).
- **Toolchain** (ai container, not persistent across rebuilds): `sudo apt-get install openjdk-21-jdk-headless`; Android SDK at `/opt/android-sdk` (platform 34, build-tools 34.0.0, cmdline-tools); `local.properties` → `sdk.dir=/opt/android-sdk`.
- **Build**: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk ./gradlew --no-daemon assembleDebug` (~1m20s). Output `app/build/outputs/apk/debug/*.apk` → copy to `BridgeLauncher-vNN.apk` in the project root. Verify with `aapt dump badging`, `apksigner verify --print-certs`.
- **Signing**: all builds use `~/.android/debug.keystore` (SHA-256 `37292fe9…`); a backup lives in `52.01 secrets/android-debug-keystore/`. **Restore it before building after any container rebuild**, or the APK will not install over the old one (a signature mismatch needs a manual uninstall, which clears settings).

### Patches carried in the `patched` branch
- `BridgeWebViewClient.handleIntentUrl`: explicit `component=` first (Firefox web apps, Bridge's own activities), then `queryIntentActivities(MAIN/LAUNCHER, package)` → start by explicit component, then `getLaunchIntentForPackage`, then raw intent; all with `FLAG_ACTIVITY_NEW_TASK`; no toasts.
- **Intercept-race fix (v24)**: `WebViewSetup.kt` posts `loadUrl(PROJECT_URL)` so it runs after the client is attached; `BridgeWebViewClient.onReceivedError` self-heals a main-frame error on `bridge.launcher` (reload after 300 ms, max 5 attempts; `onPageFinished` then `clearHistory()`).
- `JSToBridgeAPI.tryRunInHomescreenContext` uses `homeScreenContext ?: webView?.context` (`homeScreenContext` is permanently null on Android 17).
- `NavUtils`: shared `startBridgeActivity` (+`NEW_TASK`); `launchApp(app)` typo fix (it launched Bridge itself); `launchApp(pkg)` rewritten like the intent handler. `AppListItem` double launch removed; the drawer uses `tryLaunchApp`.
- Defaults baked in: project dir `/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync` (`BridgeSetting.file(defaultValue)`), status and navigation bars `Hide`, overscroll effects on, Bridge button hidden.
- UI: National Park font app-wide (variable weight 700 normal / 800 bold, needs `@OptIn(ExperimentalTextApi)`), black drawer with no search bar or bottom bar, A→Z order (`reverseLayout` removed, status-bar spacer first), dark theme background `0xff000000`.
- `PinShortcutActivity` (`CONFIRM_PIN_SHORTCUT`, immediately cancels): makes `isRequestPinShortcutSupported` true so Firefox's "Install" web app flow stores its manifest.

### Install on the device
Android 17 blocks `pm install` from Termux. With the phone plugged into **framework** (`adb` at `/usr/bin/adb`): `scp` the APK there, `adb install -r /tmp/BridgeLauncher-vNN.apk`. Without adb: copy to `/storage/emulated/0/Download/` and open it from Files. A fresh install still needs the "Manage all files" permission and Bridge chosen as the home app.

## 8. Phone-side services (Termux)

- **`ha-proxy`** (runit service, `~/ha-proxy.py`, port 8081): proxies `/api/` to the a-ha Home Assistant (`100.75.37.107`, tailnet only); **intercepts `/api/states/device_tracker…` and answers from on-device `termux-location`** so location works with no path to a-ha; falls back to a-ha. Also `GET /jmap-session` and `POST /jmap` → Stalwart with Basic auth injected from the phone-only `~/calendar-proxy.json` (chmod 600, never synced), adding `ACAO: *`.
- **Why the calendar proxy exists**: Stalwart's CORS preflight never returns `access-control-allow-origin`, so the WebView blocks every direct authenticated call (`curl` ignores CORS, so curl tests prove nothing). JMAP was chosen over CalDAV REPORT for the same reason and because it returns JSON.
- **sshd** on 8022, **Syncthing**, both under `termux-services` runit; Termux:Boot starts them.

## 9. Rules and gotchas (hard-won)

> [!warning] Blank black launcher: check the bundle first
> Check bundle coherence (`index.html` refs vs `assets/`) **before** suspecting the last code edit. The cause was content-hashed filenames plus non-atomic Syncthing delivery; `vite.config.ts` now emits fixed names (`assets/index.js`) so a half-synced bundle runs the previous version instead of 404ing. If a reload shows a stale version label, add a cache-busting query.

> [!warning] `ERR_NAME_NOT_RESOLVED` / "web page not available" means the request skipped Bridge's interceptor
> "Web page not available" = the WebView refused a navigation (a handler returned false). "`<host>` could not be resolved" = real DNS was attempted, so the request was never intercepted. v24 fixes the startup race and self-heals; never navigate the launcher document to an `intent://` URL.

- **Never use an empty-authority `intent://#Intent;component=…` URL from the frontend**; it escapes to an external browser. Use the JS API for Bridge's own activities. (`fireWebApp` has a real authority and is fine.)
- **Never hardcode launcher activities** (`launchComponentOverrides` is intentionally empty): activity names drift across app updates; `package=` resolves dynamically.
- **Tap targets inside the pull container**: never `preventDefault()` on touchmove below the activation threshold, or jitter eats the synthesized click (the old "1 in 10 taps" bug).
- **Haptics**: vibrate on `touchstart` (a vibration is cancelled when the page hides at intent hand-off); pulses under ~10 ms are imperceptible on the Pixel's actuator; each `vibrate()` cancels the previous one.
- **Keep the app-list retries unconditional.** After a cold start Bridge can return a *partial* app list (folders silently lose entries). Do not gate the re-read on "list is empty".
- **Timed calendar events**: Stalwart returns `start` for timed *and* all-day events without a `Z`; for timed events the true instant is `utcStart` (`Etc/UTC`). Timed events read time, filter and sort from `utcStart`; all-day events use floating-local `start` (their `utcStart` is the previous day in UTC-7). The JMAP window is wide (−1/+2 days) with exact filtering in JS. Stalwart rejects `utcStart` as a sort key (sort client-side). No server-side recurrence expansion (none exist in the data).
- **Probe the real API response before writing a fix**; reasoning from the symptom produced a wrong data-shape assumption once.
- **`am force-stop` on a pre-v24 APK leaves a blank screen**; recover by navigating the WebView to `https://bridge.launcher/` over CDP.
- **Firefox web app (iHasMail)**: everything on `ihasmail.taisau.tv` (logo, manifest, `/api/auth/login`) is behind Authelia. A stale session shows the shell without the cat logo and "could not sign in"; sign in at `login.taisau.tv` in a normal tab, then reopen (clear the web app's data if needed). The manifest is `standalone` (status bar stays; true fullscreen would need a server-side manifest override, declined).
- **Android 17**: `pm install`/`uninstall` and `am start` are blocked from Termux; Termux `logcat` only sees its own logs.

## 10. Debug recipes

- **Live WebView state over CDP** (run on framework, which has `node`): `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` (pid from `adb shell pidof com.tored.bridgelauncher`), then a small Node script using the global `WebSocket` against `http://127.0.0.1:9333/json` and `Runtime.evaluate` (for example fetch `Bridge.getAppsURL()` and read `history.length`). Remove the forward and the script afterwards.
- **Screenshot**: `adb exec-out screencap -p > file.png` on framework, then `scp` it over.
- **Bridge logs**: `adb logcat -d -s BridgeWebViewClient` (a "main-frame error … reloading project" line means the v24 recovery fired).
- **Cold-start test**: `adb shell am force-stop com.tored.bridgelauncher`, `adb shell input keyevent KEYCODE_HOME`, wait ~10 s, screenshot. Expect the launcher with all folder counts correct, no drawer, no error page.
- **Which version is on the phone**: `adb shell cat "/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync/.build-version"` (nested quoting needed through `tailscale ssh`).
- **Checking a deployed bundle**: grep `phone-sync/assets/index.js` for output strings, not function names (the minifier renames locals).

## 11. History (condensed)

- **2026-05-25/27**: project created; Vite/Vue/Tailwind scaffold, National Park font, folders, countdown ported from the (since deleted) `56.38 countdown-app` widget, alphabetical wave flyout, pull-to-refresh, parallel loading. v0.1.x.
- **2026-06**: location moved from browser/Termux/IP geolocation to the Home Assistant Companion `device_tracker` via the phone-local ha-proxy; Nominatim fallback chain; fixed Guanajuato weather line. Android 17 broke the stock APK (`homeScreenContext` null, no `intent://` handling), so a patched fork was built (v12-v14) and the history-guard back fix added.
- **2026-07/08**: launch bugs resolved (stale hardcoded Amazon activity; pull-to-refresh swallowing taps; haptics on touchstart; blank screen from hashed filenames); APK v15-v21 (long-press app info, defaults baked in, own app-drawer fixes, National Park font, A→Z); in-page swipe-up replaced by the home-gesture `newIntent` approach; folder subitem gold highlight + alphabetical sort; all URL launches moved off `window.open` to intent-VIEW (links open in the default browser).
- **2026-08-29**: Stalwart calendar on the home screen via the phone-local JMAP proxy (CORS root cause); pull-to-refresh bypasses caches.
- **2026-09**: calendar timezone fix (`utcStart` for timed events); location stuck-on-old-town fixed by on-device `termux-location` in ha-proxy; APK v22 (black bar-less drawer, built in the ai container for the first time) and v23 (`PinShortcutActivity` for Firefox web apps); `3 comm` email → iHasMail Firefox web app (`pwa:`).
- **2026-10-09**: `6 ai` launches Termux (`v0.6.0`).
- **2026-10-12**: fixed the intermittent `ERR_NAME_NOT_RESOLVED` screen and the endless back-swipes. Root cause: the Accompanist WebView factory ran `onCreated` (which called `loadUrl`) before attaching the client, so the first request could reach real DNS; and `main.ts` pushed two history entries on every load. APK v24 (race fix + self-heal) pushed to `taisau/launcher` branch `patched` tag `v24`; frontend `v0.6.1`-`v0.6.3` (history guard, `requestLaunchApp` first, iframe intents, minute clock, hoisted fisheye tables, `res.ok` checks, fetch timeouts, cold-start drawer ignore window, `refreshApps` retries). A cleanup removed obsolete files (old APKs, `publish.sh`, `favorites.json`, Vite template leftovers, stray debug files) and the retired Windows-workstation workflow. Verified on-device over adb: force-stop + Home lands on the launcher with all folders. The `av` HA shortcut was not tapped (the av server was off); `condo` and email work.
