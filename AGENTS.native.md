# Bridge Launcher: native APK patches and device debugging

Backlink: [[AGENTS]]. Moved out of the main file 2026-10-14 (not loaded natively; read it when changing `launcher-src/` or debugging on the phone).

## Patches carried in the `patched` branch
- `BridgeWebViewClient.handleIntentUrl`: explicit `component=` first (Firefox web apps, Bridge's own activities), then `queryIntentActivities(MAIN/LAUNCHER, package)` → start by explicit component, then `getLaunchIntentForPackage`, then raw intent; all with `FLAG_ACTIVITY_NEW_TASK`; no toasts.
- **Intercept-race fix (v24)**: `WebViewSetup.kt` posts `loadUrl(PROJECT_URL)` so it runs after the client is attached; `BridgeWebViewClient.onReceivedError` self-heals a main-frame error on `bridge.launcher` (reload after 300 ms, max 5 attempts; `onPageFinished` then `clearHistory()`).
- `JSToBridgeAPI.tryRunInHomescreenContext` uses `homeScreenContext ?: webView?.context` (`homeScreenContext` is permanently null on Android 17).
- `NavUtils`: shared `startBridgeActivity` (+`NEW_TASK`); `launchApp(app)` typo fix (it launched Bridge itself); `launchApp(pkg)` rewritten like the intent handler. `AppListItem` double launch removed; the drawer uses `tryLaunchApp`.
- Defaults baked in: project dir `/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync` (`BridgeSetting.file(defaultValue)`), status and navigation bars `Hide`, overscroll effects on, Bridge button hidden.
- UI: National Park font app-wide (variable weight 700 normal / 800 bold, needs `@OptIn(ExperimentalTextApi)`), black drawer with no search bar or bottom bar, A→Z order (`reverseLayout` removed, status-bar spacer first), dark theme background `0xff000000`.
- **Portrait lock (v25)**: `android:screenOrientation="portrait"` on `HomeScreenActivity` and `AppDrawerActivity` (Settings and the dev console still rotate). A web page cannot do this: `screen.orientation.lock()` is ignored outside fullscreen, so the old JS call was removed from `main.ts`.
- `PinShortcutActivity` (`CONFIRM_PIN_SHORTCUT`, immediately cancels): makes `isRequestPinShortcutSupported` true so Firefox's "Install" web app flow stores its manifest.

## Debug recipes (run on framework, which has `adb` and `node`)
- **Live WebView state over CDP**: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` (pid from `adb shell pidof com.tored.bridgelauncher`), then a small Node script using the global `WebSocket` against `http://127.0.0.1:9333/json` and `Runtime.evaluate` (for example fetch `Bridge.getAppsURL()` and read `history.length`). Remove the forward and the script afterwards.
- **Screenshot**: `adb exec-out screencap -p > file.png` on framework, then `scp` it over.
- **Bridge logs**: `adb logcat -d -s BridgeWebViewClient` (a "main-frame error … reloading project" line means the v24 recovery fired).
- **Cold-start test**: `adb shell am force-stop com.tored.bridgelauncher`, `adb shell input keyevent KEYCODE_HOME`, wait ~10 s, screenshot. Expect the launcher with all folder counts correct, no drawer, no error page.
- **Which version is on the phone**: `adb shell cat "/storage/emulated/0/sync/5 computadors/56 software/56.39 bridge-launcher/phone-sync/.build-version"` (nested quoting needed through `tailscale ssh`).
- **Checking a deployed bundle**: grep `phone-sync/assets/index.js` for output strings, not function names (the minifier renames locals).
- **Orientation test over adb**: set `accelerometer_rotation 0` + `user_rotation 1`, press Home, compare `screencap` PNG dimensions (portrait 1280x2856, landscape 2856x1280) against an unlocked control app (Android Settings), then restore the original settings (`accelerometer_rotation 1`, `user_rotation 0`).
- **`am force-stop` on a pre-v24 APK leaves a blank screen**; recover by navigating the WebView to `https://bridge.launcher/` over CDP.
