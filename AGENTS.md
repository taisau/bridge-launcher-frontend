# Bridge Launcher: project memory

A custom Android home screen for John's Pixel 9 Pro (Android 17), built on [Bridge Launcher](https://github.com/bridgelauncher): a native Android WebView that serves a local web project and exposes system functions to JS through a global `Bridge` object. Related: [[56.50 claude-code/AGENTS]] (the `6 ai` shortcut launches `nnp`), [[52.01 secrets/AGENTS]].

Sibling files (not loaded natively, read on demand): [[AGENTS.frontend]] (UI behaviour, gestures, launch paths, `folders.json` syntax), [[AGENTS.native]] (APK patches, adb debug recipes), [[AGENTS.history]].

## Identity

- **Stack**: Vite, Vue 3 (Composition API), TypeScript, Tailwind CSS v4. Platform floor Android 8 (API 24).
- **Repos**: frontend `github.com/taisau/bridge-launcher-frontend` (this folder's git remote). Native fork `github.com/taisau/launcher`, **branch `patched`, tag `v25`** (see [[#Native APK]]). Upstream: `bridgelauncher/launcher`, `bridgelauncher/api` (types), `bridgelauncher/api-mock`.
- **Project root** holds config JSONs and scripts; all frontend code is in `src/`.

## Hard rules and gotchas

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
- **Firefox web app (iHasMail)**: everything on `ihasmail.taisau.tv` (logo, manifest, `/api/auth/login`) is behind Authelia. A stale session shows the shell without the cat logo and "could not sign in"; sign in at `login.taisau.tv` in a normal tab, then reopen (clear the web app's data if needed). The manifest is `standalone` (status bar stays; true fullscreen would need a server-side manifest override, declined).
- **Android 17**: `pm install`/`uninstall` and `am start` are blocked from Termux; Termux `logcat` only sees its own logs.

## Current state (2026-10-15)

| Part | Version | Notes |
|---|---|---|
| Frontend | `v0.6.8` | `src/package.json` and `phone-sync/.build-version` agree; built in the ai container, delivered by Syncthing |
| APK | `v25` (`BridgeLauncher-v25.apk`, versionCode 25) | signer SHA-256 `37292fe9…` (matches `~/.android/debug.keystore`); installed and verified on the phone 2026-10-12 |
| Native source | `launcher-src/` | gitignored here, persisted on GitHub branch `patched`, tag `v25` |

Git is current with the builds (commits `0.6.7`, `0.6.8`; not pushed). `*.apk` is gitignored and untracked (the APK stays on disk; the native source is on GitHub `patched`/`v25`); `.git` still carries ~33 MB of old APK history.

## Layout and data files

- `src/App.vue` (home list, pull-to-refresh, launch paths), `AlphabetFlyout.vue` (right-edge wave strip + flyout; owns all wave state so wave frames re-render only that subtree), `haptics.ts` (`triggerHaptic`), `types.ts`, `main.ts` (history guard; the desktop API mock is a dynamic import, so it is a separate `assets/dist.js` chunk the phone never loads), `location.ts`, `weather.ts`, `calendar.ts`, `countdown.ts`, `storage.ts`, `vite.config.ts` (stable unhashed output names).
- Root: `folders.json`, `app_management.md` (source) → generates `custom_labels.json` + `hidden_apps.json`, `apps.json` (desktop-mock snapshot only; no longer copied into `phone-sync/`), `ha-config.json` and `calendar-config.json` (gitignored, copied by the build), `sync-build.sh`, `verify-sync-version.sh`, `process_app_management.js`, `phone-sync/` (build output, gitignored), `launcher-src/` (native checkout, gitignored), `BridgeLauncher-v25.apk`.
- **`app_management.md`** is the source for hiding apps and renaming them. `custom_labels.json` and `hidden_apps.json` are **regenerated on every build**; never edit them. After editing the md, run the build ("process the app management list").
- **`ha-config.json`**: `{baseUrl, entityId}`, **no token** any more; gitignored. The HA long-lived token lives only on the phone in `~/ha-proxy.json` (chmod 600), injected by `ha-proxy` when a request has no `Authorization` header (added 2026-10-15; backup `~/ha-proxy.py.bak-pre-token`). **`calendar-config.json`**: `{proxyUrl, user, sharedAccountName}`, **no password**; gitignored. JMAP account ids are resolved from `/jmap/session` by account *name* (short ids like `d`/`f` can drift).
- **`apps.json`**: desktop mock only (`npm run dev`). The phone always reads `Bridge.getAppsURL()`, so editing it never changes on-device behaviour.

## Build and deploy

**Build host = the ai container** (the only place that builds the frontend or APK). The Windows workstation and the framework host must not build this project (dual builds raced through Syncthing and produced mismatched bundles).

1. Edit `src/`, then run **`bash sync-build.sh`** . It processes `app_management.md`, **bumps the version itself** (single-digit rule with carry: `0.2.9` → `0.3.0`, never `0.2.10`; do not hand-bump), builds, stages the bundle plus JSONs in a temp dir and `rsync -a --delete`s it over `phone-sync/` (never `rm -rf`, so Syncthing cannot see an empty folder and ship deletes), and runs `verify-sync-version.sh`. Both scripts are executable now.
2. Syncthing mirrors the whole workspace to `/storage/emulated/0/sync` on the phone (folder id `jpy4g-ixqea`, phone Syncthing v2). The bundle lands at `/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync/`. Wait for "Up to Date" on both ends.
3. The user reloads by tapping the version label in the flyout's `bridge` section. Pull-to-refresh does **not** reload JS. The version label confirms the new bundle loaded.
4. **Always report all three versions** (`src/package.json`, `src/dist`, `phone-sync/.build-version`; they must match) and confirm **bundle coherence**: every `assets/...` referenced by `phone-sync/index.html` exists, exactly one `index.js`, no hashed leftovers, no nested `phone-sync/phone-sync/`.
5. `npm --prefix src run build` is for verification only, never the deploy step (it does not refresh `phone-sync/`).

**Fallback delivery** (Syncthing broken): `scp` to the phone's Termux sshd (`-P 8022`, tailnet `100.93.179.65`, password in `keys/`, indexed in [[52.01 secrets/AGENTS]]), copying `phone-sync/*` (not the directory itself).

## Native APK

- **Source**: persisted on **`github.com/taisau/launcher`, branch `patched`, tag `v25`** (`master` is stock v8; older tags v12-v15 are incomplete). Local checkout `launcher-src/` (gitignored here and excluded from Syncthing). Patch list in [[AGENTS.native]].
- **Toolchain** (ai container): JDK 21 is baked into the image (since the 2026-10-13 Dockerfile; no manual install after a rebuild). Android SDK at `/opt/android-sdk` (platform 34, build-tools 34.0.0, cmdline-tools; checked 2026-10-14); `local.properties` → `sdk.dir=/opt/android-sdk`.
- **Build**: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk ./gradlew --no-daemon assembleDebug` (~1m20s). Output `app/build/outputs/apk/debug/*.apk` → copy to `BridgeLauncher-vNN.apk` in the project root. Verify with `aapt dump badging`, `apksigner verify --print-certs`.
- **Signing**: all builds use `~/.android/debug.keystore` (SHA-256 `37292fe9…`); a backup lives in `52.01 secrets/android-debug-keystore/`. `~/.android` is a symlink into `/opt/ai/android`, so it survives rebuilds; it survived the 2026-10-13 rebuild (fingerprint checked 2026-10-14). If it is ever missing, restore it from the backup **before** building, or the APK will not install over the old one (a signature mismatch needs a manual uninstall, which clears settings).
- **Install on the device**: Android 17 blocks `pm install` from Termux. With the phone plugged into **framework** (`adb` at `/usr/bin/adb`): `scp` the APK there, `adb install -r /tmp/BridgeLauncher-vNN.apk`. Without adb: copy to `/storage/emulated/0/Download/` and open it from Files. A fresh install still needs the "Manage all files" permission and Bridge chosen as the home app.

## Phone-side services (Termux)

- **`ha-proxy`** (runit service, `~/ha-proxy.py`, port 8081): proxies `/api/` to the a-ha Home Assistant (`100.75.37.107`, tailnet only); **intercepts `/api/states/device_tracker…` and answers from on-device `termux-location`** so location works with no path to a-ha; falls back to a-ha. Also `GET /jmap-session` and `POST /jmap` → Stalwart with Basic auth injected from the phone-only `~/calendar-proxy.json` (chmod 600, never synced), adding `ACAO: *`.
- **Why the calendar proxy exists**: Stalwart's CORS preflight never returns `access-control-allow-origin`, so the WebView blocks every direct authenticated call (`curl` ignores CORS, so curl tests prove nothing). JMAP was chosen over CalDAV REPORT for the same reason and because it returns JSON.
- **sshd** on 8022, **Syncthing**, both under `termux-services` runit; Termux:Boot starts them.

## Open items

- Push the local commits when John says so.
- Not verified on the device yet (2026-10-15): `v0.6.7` haptics fix, `v0.6.8` flyout component, `touchcancel` handling, `1 ha` as a folder. a-ha was unreachable from the phone during the proxy change, so HA token injection was tested against a local echo server only, not real HA.
- `npm run dev` is effectively broken (`src/` has no `apps.json`/`folders.json` to serve); not worth fixing unless desktop previews are wanted.
- Held back on purpose: TypeScript 7, `@types/node` 26.

## History

Dated history moved to [[AGENTS.history]]. Latest: 2026-10-15 full review (frontend `v0.6.7`/`v0.6.8`: haptics fix, flyout split into a component, `touchcancel`, per-day calendar cache, midnight reload, atomic rsync deploy, mock out of the bundle, geocode cache, HA token moved phone-side, `1 ha` folder); 2026-10-12 APK v25 (portrait lock); 2026-10-13 the ai image gained JDK 21.
