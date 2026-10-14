# Bridge Launcher: frontend behaviour reference

Backlink: [[AGENTS]]. Moved out of the main file 2026-10-14 (not loaded natively; read it when changing `src/`).

## Look
National Park variable font only, pure black `#000000`, `text-gray-300/400/500`, **everything lowercase**, extra-bold (800) for navigation and clock, roughly half-size type, no icons and no vertical lines in folders. Padding `pl-14 pt-32` pulls content toward the thumb.

## Home list (top to bottom)
1. **`1 ha`**: toggles a menu of `av` (`?server=av`) and `condo` (`?server=Condo`) `homeassistant://` deep links, with a count badge. `?server=` values are **case-sensitive** and must match the Companion app's server names.
2. **Folders** from `folders.json` (empty folders hide themselves). Subitems sort alphabetically by *displayed* label (after `custom_labels.json`). The single most-launched subitem per folder is gold `#c9a961` (`topUsedPerFolder = 1`), from local counts in `localStorage` key `app_usage_counts` (device-local; wiped by a WebView data clear).
3. **`6 ai`**: launches Termux, whose `~/.bashrc` runs `ssh ai "bash -ic nnp"` (tmux `phone` → `nn`; see [[56.50 claude-code/AGENTS]]).
4. **`7 memo`**: `org.fossify.voicerecorder.debug`.

## `folders.json` entry syntax
- `com.pkg` or `com.pkg|label`: an installed app (label overrides `custom_labels.json`).
- `link:label|https://url`: opens in the **default browser** via an intent (never inside the launcher WebView).
- `pwa:label|startUrl`: launches a Firefox web app (see Launch paths). Current use: `pwa:email|https://ihasmail.taisau.tv/mail`.
- An entry whose package is not in the live app list is dropped with a `console.warn`.

## Alphabetical flyout
Hold ~100 ms on the right edge (15 px drift cancels). Fisheye wave, letters only for installed apps, haptic on activation (20 ms) and letter change (12 ms), release-to-launch for a letter's first app, sticky list until the background is tapped. Rows buzz on `touchstart` (`triggerHaptic(25, 300)`). Long-press a row opens Android's App info. The last "letter" is `bridge`: app info, settings, and the version label (tap = reload the page).

## Header
- **Clock** (ticks once per minute; tap opens Bridge settings).
- **Date + countdown**: `(249) sunday 2026-10-11`. `src/countdown.ts` counts working days to **2027-10-29** (John's retirement), skipping weekends and the PTO ranges mirrored from `6 travel/63 pto/pto.md` (source of truth), with a 5 PM cutoff (after 17:00 counting starts tomorrow).
- **Weather**: current location, then a fixed **guanajuato** line (21.015639, -101.252944). Open-Meteo, Fahrenheit, 5-minute cache, stale data is hidden.
- **Calendar** (up to 4 lines, `src/calendar.ts`): personal (john@taisau.net) gold `#c9a961`, shared (jb@taisau.net) dark red `#a13d3d`. Format `title time` or `title – 9/7`. Rules locked by the user: today only; multi-day events appear only on their first day; sorted by start, all-day first; end label = start + days − 1.

## Gestures
- **Pull-to-refresh**: engages after `pullActivationThreshold = 12` px (below that the touch is a tap, so `preventDefault` never eats clicks); `loadData(true)` bypasses every 5-minute cache. Mount, resume and app events use cached data.
- **Home gesture → Bridge app drawer**: the bottom-bar swipe cannot be intercepted, but its completion fires Bridge's `newIntent` event (the activity is `singleTask` + `CATEGORY_HOME`). `handleHomeIntent` opens the drawer only if a pause was seen within `homeIntentPauseGraceMs = 700` (already-home gesture, not "return from an app"), ignores intents during the first `homeIntentStartupIgnoreMs = 3000` after page start (cold start), and with a flyout/folder open it just closes it.
- **Back gesture**: `main.ts` keeps exactly one history guard (`history.state.bridgeGuard`) above a replaced base entry so Android's back never escapes to the system, and reloads do not grow the stack.

## Launch paths (`src/App.vue`)
- **App**: `Bridge.requestLaunchApp(pkg, false)` first (a Java call that can never navigate the WebView); fallback is an `intent://#Intent;action=MAIN;category=LAUNCHER;launchFlags=0x10000000;package=<pkg>;end` URL.
- **Web URL / HA deep link** (`fireWebUrl`): `intent://<rest>#Intent;scheme=<scheme>;action=VIEW;category=BROWSABLE;launchFlags=0x10000000;end`.
- **Firefox web app** (`fireWebApp`): `…;action=mozilla.components.feature.pwa.PWA_LAUNCHER;component=org.mozilla.firefox/mozilla.components.feature.pwa.WebAppLauncherActivity;…`. The start URL must match the manifest's resolved `start_url` exactly (iHasMail: `https://ihasmail.taisau.tv/mail`) or Firefox opens a normal tab.
- All intent URLs go through a hidden iframe (`fireIntent`), never `location.href` on the launcher document.
- **Bridge's own activities** (settings, drawer): JS API only, no intent fallback.
- UI collapse is deferred to `beforePause` so the intent is handled while the WebView is stable.

## Location
`src/location.ts` reads `ha-config.json` (`baseUrl` = the phone-local ha-proxy `http://localhost:8081`, `token`, `entityId` = the phone's `device_tracker`), reads `attributes.latitude/longitude`, then reverse-geocodes with Nominatim (`city → town → suburb → neighbourhood → hamlet → village → quarter → municipality → county`, else `"local"`, which is never cached). The entity id can drift (`pixel_9_pro` → `pixel_9_pro_2`); check the entity list when location breaks.

## Resilience
`loadData` uses `Promise.allSettled` and checks `res.ok` before `.json()`. `refreshApps()` re-reads just the app list at 2 s and 6 s after start. All external fetches have an 8 s `AbortSignal.timeout`. Weather, location and calendar are cached in `localStorage` with an `isStale` fallback.
