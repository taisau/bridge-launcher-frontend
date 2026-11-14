# Bridge Launcher: project memory

A custom Android home screen for John's Pixel 9 Pro (Android 17), built on [Bridge Launcher](https://github.com/bridgelauncher): a native Android WebView that serves a local web project and exposes system functions to JS through a global `Bridge` object. Related: [[56.50 claude-code/AGENTS]] (the `6 ai` shortcut launches `nnp`), [[52.01 secrets/AGENTS]].

Sibling files (not loaded natively, read on demand): [[AGENTS.frontend]] (UI behaviour, gestures, launch paths, `folders.json` syntax), [[AGENTS.native]] (APK patches, adb debug recipes), [[AGENTS.history]].

## Identity

- **Stack**: Vite, Vue 3 (Composition API), TypeScript, Tailwind CSS v4. Platform floor Android 8 (API 24).
- **Repos**: frontend `github.com/taisau/bridge-launcher-frontend` (this folder's git remote). Native fork `github.com/taisau/launcher`, **branch `patched`, tag `v27`** (see [[#Native APK]]). Upstream: `bridgelauncher/launcher`, `bridgelauncher/api` (types), `bridgelauncher/api-mock`.
- **Project root** holds config JSONs and scripts; all frontend code is in `src/`.

## Hard rules and gotchas

> [!warning] Blank black launcher: check the bundle first
> Check bundle coherence (`index.html` refs vs `assets/`) **before** suspecting the last code edit. The cause was content-hashed filenames plus non-atomic Syncthing delivery; `vite.config.ts` now emits fixed names (`assets/index.js`) so a half-synced bundle runs the previous version instead of 404ing. If a reload shows a stale version label, add a cache-busting query.

> [!warning] `ERR_NAME_NOT_RESOLVED` / "web page not available" means the request skipped Bridge's interceptor
> "Web page not available" = the WebView refused a navigation (a handler returned false). "`<host>` could not be resolved" = real DNS was attempted, so the request was never intercepted. v24 fixes the startup race and self-heals; never navigate the launcher document to an `intent://` URL.

- **Never use an empty-authority `intent://#Intent;component=…` URL from the frontend**; it escapes to an external browser. Use the JS API for Bridge's own activities. (`fireWebApp` has a real authority and is fine.)
- **Never hardcode launcher activities** (`launchComponentOverrides` is intentionally empty): activity names drift across app updates; `package=` resolves dynamically.
- **Tap targets inside the pull container**: never `preventDefault()` on touchmove below the activation threshold, or jitter eats the synthesized click (the old "1 in 10 taps" bug). The flyout is rendered inside `<main>`, so `handleMainTouchStart` skips the pull while it is open.
- **Flyout rows do not rely on `click`**: Chromium drops the synthesized click after ~8 px of finger drift, so rows launch on `touchend` with their own 24 px tolerance ([[AGENTS.frontend]]). Keep rows contiguous and full-width: a tap that misses a row bubbles to `<main>` and closes the flyout.
- **Haptics**: `navigator.vibrate` has duration only, no amplitude, and below ~10 ms it is imperceptible or a sharp tick. For a soft feel use `triggerTick()` (`haptics.ts`), which calls the native `Bridge.performHaptic` (APK v27+, system `SEGMENT_FREQUENT_TICK`, same engine as typing; confirmed 2026-11-01) and falls back to `vibrate(5)`. All flyout haptics (activation, letter change, app rows) use it since `v0.8.1`; the home-screen gestures in `App.vue` still use hard `vibrate()` (12-25 ms). Vibrate on `touchstart` (a vibration is cancelled when the page hides at intent hand-off). Each `vibrate()` cancels the previous one, so the flyout's first wave touch is processed silently (a letter-change pulse a frame after activation used to cancel the activation pulse; fixed `v0.6.7`). Chromium may also block `vibrate` until the page has had a real tap (unverified).
- **Keep the app-list retries unconditional.** After a cold start Bridge can return a *partial* app list (folders silently lose entries). Do not gate the re-read on "list is empty".
- **Timed calendar events**: Stalwart returns `start` for timed *and* all-day events without a `Z`; for timed events the true instant is `utcStart` (`Etc/UTC`). Timed events read time, filter and sort from `utcStart`; all-day events use floating-local `start` (their `utcStart` is the previous day in UTC-7). The JMAP window is wide (−1/+2 days) with exact filtering in JS. Stalwart rejects `utcStart` as a sort key (sort client-side). No server-side recurrence expansion (none exist in the data).
- **Probe the real API response before writing a fix**; reasoning from the symptom produced a wrong data-shape assumption once.
- **Firefox web app (iHasMail)**: everything on `ihasmail.taisau.tv` (logo, manifest, `/api/auth/login`) is behind Authelia. A stale session shows the shell without the cat logo and "could not sign in"; sign in at `login.taisau.tv` in a normal tab, then reopen (clear the web app's data if needed). The manifest is `standalone` (status bar stays; true fullscreen would need a server-side manifest override, declined).
- **Work profile apps (user 11, Test DPC)**: stock Bridge could not list or launch them (`PackageManager`, main profile only). Native fork **v26** (2026-11-01) adds `LauncherApps` support ([[AGENTS.native]]), so `com.microsoft.teams` in the `5 work` folder opens the work copy. A cross-profile intent filter (Test DPC, `msteams://`) was tried first and did not work; it was cleared.
- **Android 17**: `pm install`/`uninstall` and `am start` are blocked from Termux; Termux `logcat` only sees its own logs.

## Current state (2026-11-14)

| Part | Version | Notes |
|---|---|---|
| Frontend | `v0.9.2` | built in the ai container, delivered by Syncthing; flyout rows are full-width and launch on `touchend` (`v0.9.2`, unverified on the phone); Syncthing readout on the date row: remaining size or folder state (size confirmed 2026-11-01; the state labels added in `v0.8.6` are unverified on the phone); all flyout haptics (activation, letter change, app rows) use the native tick (letter change confirmed 2026-11-01); `7 memo` tap records via `voicememo://record`, long-press opens Memos (unverified on the phone since `v0.7.0`) |
| APK | `v27` (`BridgeLauncher-v27.apk`, versionCode 27) | signer SHA-256 `37292fe9…`; installed and confirmed on the phone 2026-11-01 |
| Native source | `launcher-src/` | gitignored here, persisted on GitHub branch `patched`, tag `v27` |

`*.apk` is gitignored and untracked (the APK stays on disk; the native source is on GitHub `patched`/`v27`); `.git` still carries ~33 MB of old APK history.

## Layout and data files

- `src/`: `App.vue` (home list, pull-to-refresh, launch paths), `AlphabetFlyout.vue` (right-edge strip + flyout; owns all wave state so wave frames re-render only that subtree), `haptics.ts`, `main.ts` (history guard; the desktop API mock is a dynamic import, i.e. a separate `assets/dist.js` chunk the phone never loads), `location.ts`, `weather.ts`, `calendar.ts`, `countdown.ts`, `vite.config.ts` (stable unhashed output names).
- Root: `folders.json`, `app_management.md` (source) → generates `custom_labels.json` + `hidden_apps.json`, `apps.json` (desktop-mock snapshot only; no longer copied into `phone-sync/`), `ha-config.json` and `calendar-config.json` (gitignored, copied by the build), `sync-build.sh`, `verify-sync-version.sh`, `process_app_management.js`, `phone-sync/` (build output, gitignored), `launcher-src/` (native checkout, gitignored), `BridgeLauncher-v27.apk` (untracked; older v25/v26 also on disk).
- **`app_management.md`** is the source for hiding apps and renaming them. `custom_labels.json` and `hidden_apps.json` are **regenerated on every build**; never edit them. After editing the md, run the build ("process the app management list").
- **`ha-config.json`**: `{baseUrl, entityId}`, **no token** any more; gitignored. The HA long-lived token lives only on the phone in `~/ha-proxy.json` (chmod 600), injected by `ha-proxy` when a request has no `Authorization` header (added 2026-10-15; backup `~/ha-proxy.py.bak-pre-token`). **`calendar-config.json`**: `{proxyUrl, user, sharedAccountName}`, **no password**; gitignored. JMAP account ids are resolved from `/jmap/session` by account *name* (short ids like `d`/`f` can drift).
- **`apps.json`**: desktop mock only (`npm run dev`). The phone always reads `Bridge.getAppsURL()`, so editing it never changes on-device behaviour.

## Build and deploy

**Build host = the ai container** (the only place that builds the frontend or APK). The Windows workstation and the framework host must not build this project (dual builds raced through Syncthing and produced mismatched bundles).

1. Edit `src/`, then run **`bash sync-build.sh`**. It processes `app_management.md`, **bumps the version itself** (single-digit rule with carry: `0.2.9` → `0.3.0`, never `0.2.10`; do not hand-bump), builds, stages the bundle plus JSONs in a temp dir and `rsync -a --delete`s it over `phone-sync/` (never `rm -rf`, so Syncthing cannot see an empty folder and ship deletes), and runs `verify-sync-version.sh`.
2. Syncthing mirrors the whole workspace to `/storage/emulated/0/sync` on the phone (folder id `jpy4g-ixqea`, phone Syncthing v2). The bundle lands at `/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync/`. Wait for "Up to Date" on both ends.
3. The user reloads by tapping the version label in the flyout's `bridge` section. Pull-to-refresh does **not** reload JS. The version label confirms the new bundle loaded.
4. **Always report all three versions** (`src/package.json`, `src/dist`, `phone-sync/.build-version`; they must match) and confirm **bundle coherence**: every `assets/...` referenced by `phone-sync/index.html` exists, exactly one `index.js`, no hashed leftovers, no nested `phone-sync/phone-sync/`.
5. `npm --prefix src run build` is for verification only, never the deploy step (it does not refresh `phone-sync/`).

> [!note] Pushing to GitHub
> The frontend remote has no stored credentials, so a plain `git push` fails (`could not read Username`). Pass the PAT for one command without saving it: `GH_PAT="$(<keys/github-pat.key)" git -c credential.helper= -c 'credential.helper=!f(){ echo username=taisau; echo "password=$GH_PAT"; }; f' push` (key path in [[52.01 secrets/AGENTS]]).

**Phone never gets the bundle** (2026-10-30: phone stuck on v0.7.0 while v0.7.1 was built): the Tailscale app on the phone was not running (no `tailscale0`, node offline for a day); cause (from `dumpsys activity exit-info com.tailscale.ipn`): Obtainium updated Tailscale at 2026-10-28 20:35 (`PACKAGE UPDATED` kills the running VPN) and Android does not restart it unless Always-on VPN is set (it is now, since 2026-10-30), so the phone's Syncthing was disconnected from everything, and even after reconnecting it had a ~31 GB backlog ahead of the bundle. Fix: launch the Tailscale app (`am start --user 0 -n com.tailscale.ipn/.MainActivity` over adb, or open it by hand), then push `phone-sync/*` with `adb push` (framework adb; wireless pairing in [[53.02 pixel 9 pro/AGENTS]]) if Syncthing is slow. Check the phone's copy with `cat ".../phone-sync/.build-version"`.

**Fallback delivery** (Syncthing broken): `scp` to the phone's Termux sshd (`-P 8022`, tailnet `100.102.14.109` since the 2026-11-07 restore, key login with the shared `id_rsa`), copying `phone-sync/*` (not the directory itself).

## Native APK

- **Source**: persisted on **`github.com/taisau/launcher`, branch `patched`, tag `v27` (pushed 2026-11-01)** (`master` is stock v8; older tags v12-v15 are incomplete). Local checkout `launcher-src/` (gitignored here and excluded from Syncthing). Patch list in [[AGENTS.native]].
- **Toolchain** (ai container): JDK 21 is baked into the image (since the 2026-10-13 Dockerfile; no manual install after a rebuild). Android SDK at `/opt/android-sdk` (platform 34, build-tools 34.0.0, cmdline-tools; checked 2026-10-14); `local.properties` → `sdk.dir=/opt/android-sdk`.
- **Build**: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk ./gradlew --no-daemon assembleDebug` (~1m20s). Output `app/build/outputs/apk/debug/*.apk` → copy to `BridgeLauncher-vNN.apk` in the project root. Verify with `aapt dump badging`, `apksigner verify --print-certs`.
- **Signing**: all builds use `~/.android/debug.keystore` (SHA-256 `37292fe9…`); a backup lives in `52.01 secrets/android-debug-keystore/`. `~/.android` is a symlink into `/opt/ai/android`, so it survives rebuilds; it survived the 2026-10-13 rebuild (fingerprint checked 2026-10-14). If it is ever missing, restore it from the backup **before** building, or the APK will not install over the old one (a signature mismatch needs a manual uninstall, which clears settings).
- **Install on the device**: Android 17 blocks `pm install` from Termux. With the phone plugged into **framework** (`adb` at `/usr/bin/adb`): `scp` the APK there, `adb install -r /tmp/BridgeLauncher-vNN.apk`. Without adb: copy to `/storage/emulated/0/Download/` and open it from Files. A fresh install still needs the "Manage all files" permission and Bridge chosen as the home app.

## Phone-side services (Termux)

- **`ha-proxy`** (runit service, `~/ha-proxy.py`, port 8081): proxies `/api/` to the a-ha Home Assistant (`100.75.37.107`, tailnet only); **intercepts `/api/states/device_tracker…` and answers from on-device `termux-location`** so location works with no path to a-ha; falls back to a-ha. Also `GET /jmap-session` and `POST /jmap` → Stalwart with Basic auth injected from the phone-only `~/calendar-proxy.json` (chmod 600, never synced), adding `ACAO: *`.
- **`GET /syncthing`** (added 2026-11-01, backup `~/ha-proxy.py.bak-pre-syncthing`): compact JSON from the phone's own Syncthing REST API (`127.0.0.1:8384`, API key read from `~/.local/state/syncthing/config.xml` per call, never leaves the phone): `{ok, state, pullBytes, pullItems, completion, connected, total}` for folder `jpy4g-ixqea`. `{ok:false}` when Syncthing is down. The frontend shows it on the date row ([[AGENTS.frontend]]); a stalled phone shows `sync offline` or a stuck `↓ size`.
- **`termux-location` needs Termux:API location set to "Allow all the time"** (`ACCESS_BACKGROUND_LOCATION`; Termux:API always runs in the background). Without it every call returns `API_ERROR: Failed to get location`, the proxy falls back to a-ha (`502` when the van is offline) and the launcher keeps its last cached city with no age limit (`fetchLocation` in `location.ts`). Happened after the 2026-11-07 phone restore (Clackamas shown in Phoenix); fixed 2026-11-12 with `su -c 'pm grant com.termux.api android.permission.ACCESS_BACKGROUND_LOCATION'`. Check: `curl localhost:8081/api/states/device_tracker.pixel_9_pro` from Termux must return 200 with current coordinates.
- **Why the calendar proxy exists**: Stalwart's CORS preflight never returns `access-control-allow-origin`, so the WebView blocks every direct authenticated call (`curl` ignores CORS, so curl tests prove nothing). JMAP was chosen over CalDAV REPORT for the same reason and because it returns JSON.
- **sshd** on 8022, **Syncthing**, both under `termux-services` runit; Termux:Boot starts them.

## Open items

- HA token injection by `ha-proxy` was tested only against a local echo server (a-ha was unreachable from the phone on 2026-10-15); re-test with real HA when the van is reachable: `curl localhost:8081/api/states/<entity>` from Termux with no token should return 200.
- Optional: move the `App.vue` gesture haptics (pull-to-refresh etc.) to `triggerTick()` for consistency; John has not asked yet.
- `npm run dev` is effectively broken (`src/` has no `apps.json`/`folders.json` to serve); fix only if desktop previews are wanted.
- Held back on purpose: TypeScript 7, `@types/node` 26.

## History

Dated history in [[AGENTS.history]]. Latest: 2026-11-14 code review; flyout rows made easy to hit (`v0.9.2`).
