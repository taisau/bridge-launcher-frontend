# Bridge Launcher Setup: LLM Access

## 🌐 Project Identity & Core Context

### Overview
This project directory manages the setup, configuration, and development of a custom Android launcher using [Bridge Launcher](https://github.com/bridgelauncher). Bridge Launcher acts as a middleman between HTML, JS, and CSS and the native Android system, allowing for custom launcher creation using standard web technologies.

### Source
- **GitHub Organization**: https://github.com/bridgelauncher
- **Core Launcher App**: https://github.com/bridgelauncher/launcher
- **Patched Core Fork (v12)**: https://github.com/taisau/launcher (tagged `v12`)
- **Custom Frontend**: https://github.com/taisau/bridge-launcher-frontend
- **JS API Types**: https://github.com/bridgelauncher/api
- **API Mock**: https://github.com/bridgelauncher/api-mock

### Context
- **Platform Focus**: Android 8 (API level 24) and above.
- **Device OS**: Pixel 9 Pro runs Android 17 (verified via phone `ro.build.version.release`).
- **Tech Stack**: Vite, Vue 3 (Composition API), TypeScript, and Tailwind CSS v4.
- **Core Mechanism**: A native Android WebView that exposes system functions (launching apps, wallpaper interaction, notifications, etc.) to JS via a global `Bridge` object.

---

## 🛠️ Configuration & Customization

### Key Components
- **Bridge API**: Accessed via the global `Bridge` variable in JS. Provides endpoints to fetch installed apps (`Bridge.getAppsURL()`) and app icons (`Bridge.getDefaultAppIconURL(packageName)`).
- **Mocking Strategy**: Local development uses `@bridgelauncher/api-mock`. The mock is configured in `main.ts` to use a root-level `apps.json` (exported from the phone) to ensure local development perfectly mirrors the device's installed apps.
- **Folder System**: The launcher uses a logical folder system defined in `folders.json`. This allows for categories (e.g., "media", "news") to be managed via JSON while the UI handles the expansion and display.
- **Top-Level Links**: Specific apps can be hardcoded as direct top-level links (e.g., "1 ha", "6 assistant") for instant access. Supports custom web links via `link:label|url` in `folders.json`.

### Visual Aesthetic & Style
- **Typography**: Uses the "National Park" variable font exclusively.
- **Color Palette**: Pure black background (`#000000`) for OLED power efficiency with `text-gray-300` and `text-gray-500` accents.
- **Text Styling**: Strictly lowercase across the entire UI. Extra bold (`800`) weights used for primary navigation and clock.
- **Proportions**: Font sizes and icons are set to roughly 50% of standard mobile defaults for a compact, minimal look. Folders and apps inside folders show **no icons and no vertical lines**.
- **Alignment**: Custom horizontal and vertical padding (`pl-14`, `pt-32`) shifts the content toward the center for better thumb reach and visual balance.

### Custom Features
- **Working Days Countdown**: Migrated Kotlin logic from `56.38 countdown-app` to a TypeScript utility (`src/countdown.ts`). Calculates remaining working days until July 9, 2027, accounting for weekends, specific PTO/surgery ranges, and a "5:00 PM cutoff" rule (starts counting from tomorrow after 17:00). Consolidated into the date line in parentheses.
- **Alphabetical Flyout**: High-performance gesture-driven app list triggered by a brief hold (~100ms) on the right edge. Features hold-to-activate with drift cancellation (15px threshold), a confirmation haptic click on activation, fisheye "wave" animation, haptic feedback on letter change, and "Release to Launch" behavior for the first app of a letter. Only displays letters with installed apps. The list remains "sticky" after release until background is tapped.
- **Recovery Triggers**:
    - **Clock Tap**: Opens Bridge Launcher Settings.
    - **Bridge Flyout**: Special option at the bottom of the alphabetical scroll providing "refresh", "settings", and the version number (links to GitHub).
- **Local Weather & Location**:
    - Current-location weather now uses **Home Assistant Companion App** as the phone location provider. Bridge Launcher does not have native Android location permission, so browser geolocation is not reliable and the old browser/Termux/IP fallback stack was removed from `src/location.ts`.
    - `src/location.ts` reads root-level `ha-config.json`, calls Home Assistant REST API `/api/states/{entityId}`, and extracts `attributes.latitude` / `attributes.longitude` from the configured phone `device_tracker` entity.
    - `ha-config.json` is copied by `sync-build.sh` into `phone-sync/` if present. It currently contains placeholders and must be filled with the user's Home Assistant URL, long-lived access token, and phone entity ID before deployment.
    - Fetches the daily high temperature and current weather code from **Open-Meteo** (Fahrenheit), caches for 5 minutes, and keys current weather cache by rounded coordinates while retaining `weather_data` as the immediate-display fallback.
    - A **fixed-location weather line** (Guanajuato, MX at 21.015639, -101.252944) displays below the current location weather. It now hardcodes the label `guanajuato` and no longer uses Nominatim.


### Stability & Learnings
- **Direct-Intent Strategy**: To avoid `HomeScreenContext is null` errors, app launches (`requestLaunchApp`) are triggered **immediately** on tap. UI state changes (collapsing folders/flyouts) are deferred to the `beforePause` event to ensure the WebView is stable when the native intent is processed.

---

## 📂 Usage & Workflows

### Project Development Workflow
1. **Source of Truth**: All source code is in `src/`. Configuration files (`apps.json`, `folders.json`, `favorites.json`, `app_management.md`) live in the project root for easy access.
2. **App Management**: Edit `app_management.md` to show/hide apps in the flyout and change their display names. After editing, tell the agent to "process the app management list".
3. **Mock Environment**: Run `npm run dev` in `src/` to develop on desktop. The mock will load `apps.json` from the root.
4. **Deployment (Automated/Syncthing)**: Use `./sync-build.sh`. This script:
    - Builds the web project.
    - Clears the `phone-sync/` directory.
    - Copies web assets AND the root `.json` configuration files to `phone-sync/`.
    - Syncthing mirrors `phone-sync/` to the Pixel 9 Pro.
    - **Note:** Always show/report the current version number to the user after completing a build.
    - **Versioning rule:** Whenever any change affects the generated HTML/web bundle (including edits to `src/App.vue`, `src/main.ts`, `src/style.css`, or other frontend source), bump `src/package.json` `version` before building, and explicitly notify the user that the version was bumped.
    - **Release path rule:** Do not use `npm --prefix src run build` as the final deployment step. Use `./sync-build.sh` so `phone-sync/` is refreshed.
    - **Completion checklist (required before saying done):** report all three: `src/package.json` version, `src/dist` bundle version, and `phone-sync` bundle version; they must match.
5. **Home Assistant location setup (required for current-location weather)**:
    - Fill root-level `ha-config.json` with:
      - `baseUrl`: the Home Assistant base URL reachable from the phone.
      - `token`: a Home Assistant long-lived access token.
      - `entityId`: the phone `device_tracker` entity from the Home Assistant Companion App.
    - Example shape:
      `{ "baseUrl": "https://your-home-assistant-url", "token": "YOUR_LONG_LIVED_ACCESS_TOKEN", "entityId": "device_tracker.your_phone_entity" }`
    - Keep this file private because the token can access Home Assistant.
6. **Activation**: Open Bridge Launcher on the device, navigate to settings, and point the active project to the `phone-sync/` directory.

---

## 📝 Historical Log & Memories
- **2026-05-25**: Initial project directory and memory initialized. Scaffolded Vite/Vue/Tailwind project with National Park font and custom minimal UI. Set up Syncthing-based build pipeline and downloaded Bridge Launcher v0.1.0-alpha APK directly into the project folder.
- **2026-05-25**: Implemented "Favorites Mirroring" and "Logical Folders". Migrated retirement countdown logic from Kotlin project to TypeScript utility. Applied extra-bold, halved-size, lowercase styling. Flattened `src` structure and updated `sync-build.sh` to include data JSONs in the production sync.
- **2026-05-26**: Implemented "Alphabetical Wave Flyout" with fisheye effect and haptic feedback. Solved `HomeScreenContext is null` errors using a Direct-Intent strategy. Integrated countdown into the date line. Added recovery triggers (Settings on clock, Reload on corner). Versioned at `v0.1.1`.
- **2026-05-27**: Implemented efficiency and speed improvements including parallel data loading (`Promise.allSettled`) and O(1) app lookups in folders. Added new features: hiding empty folders automatically, expanded haptic feedback on interactions, and a pull-to-refresh gesture on the main layout. Versioned at `v0.1.2`.
- **2026-06-05**: Major implementation of Local Weather & Location. Discovered and integrated the Termux Headless API for instant on-device coordinates (resolving previous HA, VPN, and IP geolocation issues). Passed coordinates to BigDataCloud for reverse geocoding and Open-Meteo for weather, formatting it directly into the date line in `App.vue`. Versioned `v0.1.20`-`v0.1.23`.
- **2026-06-06**: Reduced date/weather letter-spacing from `tracking-[0.4em]` to `tracking-wider` (0.05em). Swapped BigDataCloud reverse-geocoding for Nominatim (OpenStreetMap) with a richer locality chain: `neighbourhood → suburb → hamlet → village → quarter → city → town`. Added a fixed-location weather line for Guanajuato, MX (21.015639, -101.252944) displaying below the current-location weather. Tightened weather line spacing from `mt-1` to `mt-0.5`. Implemented hold-to-activate for the alphabetical flyout with a ~100ms hold timer, 15px drift cancellation, and haptic confirmation click on activation. Versioned `v0.1.24`-`v0.1.30`.
- **2026-06-09**: Cold boot `HomeScreenContext is null` recovery. After a phone reboot, Bridge Launcher's native `homeScreenContext` may be null for a period while the Activity initializes. Added retry logic (10 attempts, 500ms intervals) with `showToastIfFailed: false` to suppress the native error toast, plus an `intent://` URL fallback via `window.open` after retries exhaust. The clock tap (→ `openBridgeSettings`) also recovers because it triggers a pause/resume lifecycle that re-establishes the context. Versioned `v0.1.35`-`v0.1.38`.
- **2026-06-09**: Replaced Termux headless API location (`localhost:8000/location`) with `navigator.geolocation.getCurrentPosition()` as the primary GPS source. Browser geolocation uses the same Android location services as Google Maps, fixing inaccurate location resolution that was falling back to IP geolocation. Also flipped the Nominatim locality priority chain to `city → town → suburb → neighbourhood → hamlet → village → quarter` so city names take priority over obscure neighborhoods. Versioned `v0.1.39`.
- **2026-06-09**: Location stack overhaul. Replaced the single-tier Termux-API approach with a three-tier fallback chain: (1) browser geolocation (3s timeout), (2) Python HTTP server wrapping `termux-location` on phone (`~/locserv.py` on ports 8000→8080), (3) IP geolocation. Fixed a port-loop bug where a connection-refused on port 8080 skipped port 8000. Removed `mode: 'cors'` from the Termux fetch to avoid WebView CORS blocking. Set up SSH access to the phone (Termux `sshd` on port 8022, keyed via `tailscale ssh` through the framework host). The Termux location server script (`locserv.py`) is deployed to the phone's home directory and must be started manually after reboot. Versioned `v0.1.40`-`v0.1.44`.
- **2026-06-10**: Replaced fragile browser geolocation/Termux/IP current-location stack with Home Assistant Companion App based location. `src/location.ts` now reads `ha-config.json` and fetches the configured `device_tracker` state from Home Assistant. `src/weather.ts` now caches current weather by rounded coordinates, validates Open-Meteo responses, and hardcodes fixed Guanajuato label instead of reverse-geocoding through Nominatim. `sync-build.sh` copies `ha-config.json` into `phone-sync/` if present. Build verified with `npm --prefix src run build`; diagnostics clean. Remaining setup: replace placeholder values in root `ha-config.json` with the user's actual HA base URL, long-lived access token, and phone device tracker entity, then run `./sync-build.sh`.
- **2026-06-16**: Synced PTO exclusion ranges in `src/countdown.ts` to match current plan in `6 travel/62 pto/pto.md`. V2 narrowed (Jun 20–Jul 5 → Jun 29–Jul 3), V3 removed entirely (was Sep 5–13), V4 narrowed to Thanksgiving only (Nov 21–29 → Nov 25–27), V5 narrowed (Dec 17–Jan 4 → Dec 24–Jan 1). Independence Day observed confirmed as Jul 2 (Fri) per company schedule.
- **2026-06-17/18**: Iterated on `attemptLaunchWithRetry` to handle cold boot `homeScreenContext is null` errors. Original fix (v0.1.57) replaced strict `===` check with case-insensitive `includes()`, increased retries from 10→30. Regressed in v0.1.57-v0.1.61 via incorrect condition logic and removed try/catch. All intermediate attempts discarded in favor of native fix (see below).
- **2026-06-18**: Android 17 upgrade broke Bridge Launcher v0.1.0-alpha completely. Root causes: (1) `homeScreenContext` permanently null on new Android API, (2) `BridgeWebViewClient` had no `shouldOverrideUrlLoading` for `intent://` schemes, (3) `am start`/`pm` blocked from Termux shell. Solution: built patched Bridge Launcher APK from source (v12, `versionCode 12`) with `shouldOverrideUrlLoading` handler that uses `packageManager.getLaunchIntentForPackage()` — same method as native Bridge — falling back to raw intent parsing. JS side: `launchIntent()` uses `intent://#Intent;...` format (note `//`) via `location.href` assignment. Built with Temurin JDK 21 + Android SDK 34 + Gradle 8.9 on framework host. First two APK builds (v6, v7) failed: v6 had only new-API `shouldOverrideUrlLoading`, v7 added deprecated-API override but used raw `MAIN/LAUNCHER` intent (broke apps like Harmonic, Voice). v8 fix: `packageManager.getLaunchIntentForPackage()` resolves correct intent for every app. Fork saved to https://github.com/taisau/launcher (tagged `v12`).
- **2026-06-18**: Intent URL format bug. The frontend was using `intent:#Intent;...` (without `//`) but `handleIntentUrl` checks `url.startsWith("intent://")` so it never matched. Fixed to `intent://#Intent;...` in `launchIntent()`. Also switched from `a.click()` to `location.href = intentUrl` since `a.click()` doesn't reliably trigger `shouldOverrideUrlLoading` on Android 17.
- **2026-06-18**: Back gesture escape fix. When `canGoBack` is false, the WebView's Compose `BackHandler` doesn't fire, and the back gesture (swipe from left edge) escapes to the Android system (shows system launcher). Fixed by adding `history.pushState()` entries in `main.ts` to always keep the WebView's `canGoBack` true. A `popstate` listener refills the buffer (wrapped in `setTimeout` to prevent re-entrant loops when Bridge Launcher resumes). Attempted native fixes (Compose `BackHandler`, `OnBackPressedCallback`) caused APK crashes, so the history buffer approach is used instead.
- **2026-06-18**: APK deployment method. Android 17 blocks `pm install` and `pm uninstall` from Termux shell (`INTERACT_ACROSS_USERS_FULL` denial). `termux-open` opens the installer but fails silently on signature mismatch. Working method: copy APK to `/storage/emulated/0/Download/bridge-v.apk` and run `am start -a android.intent.action.VIEW -d file:///... -t application/vnd.android.package-archive`. Clean install requires manual uninstall via Settings first.
- **2026-06-18**: Debug keystore on framework host at `~/.android/debug.keystore` (created 2026-06-17). All debug APK builds use this key. Must keep it consistent across builds or APK upgrades will fail.
- **2026-06-18**: `Download` folder (singular, not `Downloads`) on Pixel 9 Pro at `/storage/emulated/0/Download/`. SSH port 8022 managed by Termux `sshd` runit service. ADB (`android-tools`) available via `pkg install`. The `ha-proxy` runit service directory (`/data/data/com.termux/files/usr/var/service/ha-proxy`) was lost after `pkg install android-tools`; must be recreated or proxy started manually via `nohup python3 ~/ha-proxy.py &`.
- **2026-06-18**: v9-v11 APK builds crashed on launch. Root cause: the Compose `BackHandler` and `OnBackPressedCallback` in `HomeScreenActivity.kt` were incompatible with the activity lifecycle. v12 reverts to clean v8 code with only versionCode bumped. The back gesture fix is handled entirely in the frontend via `history.pushState`.
- **2026-06-17**: Set up phone (Pixel 9 Pro) remote access. Termux (with Termux:API and Termux:Boot add-ons) has sshd on port 8022 with password auth. Framework host (`100.121.57.47`) now has key-based SSH access to the phone via `~/.ssh/id_rsa`. Syncthing v2.1.1 manages `phone-sync/` sync. Both sshd and syncthing are managed by `runsvdir` via `termux-services` (`/data/data/com.termux/files/usr/var/service/{sshd,syncthing}`). Auto-start paths: `~/.termux/boot/syncthing` (Termux:Boot at device boot) and `~/.bashrc` (when Termux is opened). Moved refresh action from separate flyout link to version number label.
