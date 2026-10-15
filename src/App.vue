<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { calculateRemainingWorkingDays } from './countdown'
import { fetchLocation } from './location'
import { fetchWeather, fetchFixedWeather, type WeatherData } from './weather'
import { fetchCalendarEvents, type CalendarData, type CalendarDisplayEvent } from './calendar'

declare const __APP_VERSION__: string;

interface BridgeApp {
  packageName: string
  label: string
  url?: string
  isPwa?: boolean
  isAction?: boolean
  action?: () => void
}

interface Folders {
  [key: string]: string[] // Folder name -> Array of package names or link strings
}

const folders = ref<Folders>({})
const allApps = ref<BridgeApp[]>([])
const hiddenApps = ref<string[]>([])
const customLabels = ref<Record<string, string>>({})
const loading = ref(true)
const expandedFolder = ref<string | null>(null)
const showHaMenu = ref(false)
const remainingDays = ref<number | null>(null)
const weather = ref<WeatherData | null>(null)
const fixedWeather = ref<WeatherData | null>(null)
const calendarEvents = ref<CalendarData | null>(null)
const apkVersion = `apk v${window.Bridge?.getBridgeVersionCode?.() ?? '?'}`
const version = `v${__APP_VERSION__} · ${apkVersion}`
const now = ref(new Date())
let clockTimer: any
let retryTimers: ReturnType<typeof setTimeout>[] = []
let loadDataDebounceTimer: ReturnType<typeof setTimeout> | null = null
let loadDataInFlight: Promise<void> | null = null
let waveAnimationFrame: number | null = null
let pendingWaveTouch: Touch | null = null
let remainingDaysKey = ''

const appPackageMap = computed(() => {
  const map: Record<string, BridgeApp> = {}
  allApps.value.forEach(app => {
    map[app.packageName] = app
  })
  return map
})

const hiddenAppSet = computed(() => new Set(hiddenApps.value))

const visibleApps = computed(() => {
  return allApps.value.filter(app => !hiddenAppSet.value.has(app.packageName))
})

const renamedVisibleApps = computed(() => {
  return visibleApps.value.map(app => ({
    ...app,
    label: customLabels.value[app.packageName] || app.label
  }))
})

const folderAppsMap = computed(() => {
  const map: Record<string, BridgeApp[]> = {}
  Object.entries(folders.value).forEach(([folderName, items]) => {
    map[folderName] = items
      .map(item => {
        if (item.startsWith('link:')) {
          const parts = item.substring(5).split('|')
          return {
            packageName: `link:${parts[0]}`,
            label: parts[0],
            url: parts[1]
          } as BridgeApp
        }
        if (item.startsWith('pwa:')) {
          const parts = item.substring(4).split('|')
          return {
            packageName: `pwa:${parts[0]}`,
            label: parts[0],
            url: parts[1],
            isPwa: true
          } as BridgeApp
        }
        const pipeIndex = item.indexOf('|')
        const pkg = pipeIndex === -1 ? item : item.substring(0, pipeIndex)
        const folderLabel = pipeIndex === -1 ? null : item.substring(pipeIndex + 1)
        const app = appPackageMap.value[pkg]
        if (app) {
          return { ...app, label: folderLabel || customLabels.value[app.packageName] || app.label }
        }
        console.warn(`folder "${folderName}": package not found in app list, dropping entry: ${pkg}`)
        return undefined
      })
      .filter((app): app is BridgeApp => !!app)
      .sort((a, b) => a.label.localeCompare(b.label))
  })
  return map
})

// --- Usage tracking (drives the "most used" highlight inside folders) ---
// Counts are kept locally per package and only ever read back here; nothing is
// synced or sent anywhere.
const usageStorageKey = 'app_usage_counts'
const usageCounts = ref<Record<string, number>>({})
const topUsedPerFolder = 1

const loadUsageCounts = () => {
  try {
    const raw = localStorage.getItem(usageStorageKey)
    if (raw) usageCounts.value = JSON.parse(raw)
  } catch (e) {
    console.warn('usage counts hydration failed', e)
  }
}

const recordUsage = (packageName: string) => {
  if (!packageName || packageName.startsWith('action:')) return
  usageCounts.value = {
    ...usageCounts.value,
    [packageName]: (usageCounts.value[packageName] || 0) + 1
  }
  try {
    localStorage.setItem(usageStorageKey, JSON.stringify(usageCounts.value))
  } catch (e) {
    console.warn('usage counts persist failed', e)
  }
}

const topUsedByFolder = computed(() => {
  const map: Record<string, Set<string>> = {}
  Object.entries(folderAppsMap.value).forEach(([folderName, apps]) => {
    const ranked = apps
      .filter(app => (usageCounts.value[app.packageName] || 0) > 0)
      .sort((a, b) => (usageCounts.value[b.packageName] || 0) - (usageCounts.value[a.packageName] || 0))
      .slice(0, topUsedPerFolder)
    map[folderName] = new Set(ranked.map(app => app.packageName))
  })
  return map
})

const isTopUsed = (folderName: string, packageName: string) => {
  return topUsedByFolder.value[folderName]?.has(packageName) ?? false
}

const haUsageKey = (label: string) => `ha:${label}`
const topHaShortcut = computed(() => {
  const ranked = haShortcuts
    .filter(s => (usageCounts.value[haUsageKey(s.label)] || 0) > 0)
    .sort((a, b) => (usageCounts.value[haUsageKey(b.label)] || 0) - (usageCounts.value[haUsageKey(a.label)] || 0))
    .slice(0, 1)
  return ranked[0]?.label ?? null
})

const appsByLetter = computed(() => {
  const map: Record<string, BridgeApp[]> = {}

  renamedVisibleApps.value.forEach(app => {
    let firstChar = app.label.charAt(0).toLowerCase()
    if (!/[a-z]/.test(firstChar)) firstChar = '#'
    if (!map[firstChar]) map[firstChar] = []
    map[firstChar].push(app)
  })

  for (const char in map) {
    map[char].sort((a, b) => a.label.localeCompare(b.label))
  }

  map['bridge'] = [
    { label: 'app', packageName: 'action:info', isAction: true, action: () => {
      if (window.Bridge && window.Bridge.requestOpenAppInfo) {
        window.Bridge.requestOpenAppInfo('com.tored.bridgelauncher')
      }
    } },
    { label: 'settings', packageName: 'action:settings', isAction: true, action: () => openBridgeSettings() },
    { label: version, packageName: 'action:version', isAction: true, action: () => {
      window.location.reload()
    } }
  ]

  return map
})

const filteredAlphabet = computed(() => {
  const letters = alphabet.filter(char => appsByLetter.value[char] && appsByLetter.value[char].length > 0)
  return [...letters, 'bridge']
})

const activeIndex = computed(() => filteredAlphabet.value.indexOf(activeLetter.value))

const pullStartY = ref(0)
const pullDistance = ref(0)
const isRefreshing = ref(false)
const refreshThreshold = 100
const pullActivationThreshold = 12

const isWaving = ref(false)
const stickyLetter = ref('')
const touchY = ref(0)
const touchX = ref(0)
let waveHoldTimer: ReturnType<typeof setTimeout> | null = null
let initialTouch = { x: 0, y: 0 }
const activeLetter = ref('')
const alphabet = '#abcdefghijklmnopqrstuvwxyz'.split('')
const windowHeight = ref(window.innerHeight)

// Fisheye effect calculation
const scaleByDistance: Record<number, number> = {
  0: 2.5,
  1: 2.0,
  2: 1.7,
  3: 1.5,
  4: 1.35,
  5: 1.2,
  6: 1.1,
  7: 1.05
}
const opacityByDistance: Record<number, number> = {
  0: 1.0,
  1: 0.9,
  2: 0.75,
  3: 0.6,
  4: 0.45,
  5: 0.35,
  6: 0.28,
  7: 0.22
}
const translateXByDistance: Record<number, number> = {
  0: -60,
  1: -52,
  2: -42,
  3: -33,
  4: -24,
  5: -15,
  6: -8,
  7: -3
}

const getLetterStyle = (char: string, index: number) => {
  if (!isWaving.value) {
    return {
      opacity: 0,
      transform: 'translate3d(0, 0, 0) scale(1)'
    }
  }

  if (char === 'bridge') {
    const containerHeight = windowHeight.value * 0.9
    const containerTop = windowHeight.value * 0.05
    const letterHeight = containerHeight / filteredAlphabet.value.length
    const letterCenterY = containerTop + (index * letterHeight) + (letterHeight / 2)
    const distance = Math.abs(touchY.value - letterCenterY)
    const range = 150

    if (distance < range) {
      const power = Math.pow(Math.cos((distance / range) * (Math.PI / 2)), 2)
      const scale = 1 + (power * 1.5)
      const translateX = -power * 60
      return {
        transform: `translate3d(${translateX}px, 0, 0) scale(${scale})`,
        opacity: 1,
        color: 'white'
      }
    }
    return {
      opacity: 0.3,
      transform: 'translate3d(0, 0, 0) scale(1)'
    }
  }

  const distanceFromActive = Math.abs(index - activeIndex.value)

  const scale = scaleByDistance[distanceFromActive] ?? 1.0
  const opacity = opacityByDistance[distanceFromActive] ?? 0.3
  const translateX = translateXByDistance[distanceFromActive] ?? 0
  const color = distanceFromActive === 0 ? '#ffffff' : undefined

  return {
    transform: `translate3d(${translateX}px, 0, 0) scale(${scale})`,
    opacity,
    ...(color && { color })
  }
}

// Gesture Handling
const handleWaveStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  initialTouch = { x: touch.clientX, y: touch.clientY }
  const touch0 = touch

  if (waveHoldTimer) clearTimeout(waveHoldTimer)

  waveHoldTimer = setTimeout(() => {
    isWaving.value = true
    stickyLetter.value = ''
    // Process the first touch synchronously and silently: a letter-change
    // buzz a frame later would cancel this 20 ms activation pulse.
    processWaveTouch(e.touches[0] ?? touch0, true)
    triggerHaptic(20)
    waveHoldTimer = null
  }, 100)
}

const handleWaveMove = (e: TouchEvent) => {
  const touch = e.touches[0]

  if (!isWaving.value) {
    if (waveHoldTimer) {
      const drift = Math.sqrt(
        Math.pow(touch.clientX - initialTouch.x, 2) +
        Math.pow(touch.clientY - initialTouch.y, 2)
      )
      if (drift > 15) {
        clearTimeout(waveHoldTimer)
        waveHoldTimer = null
      }
    }
    return
  }

  pendingWaveTouch = touch
  if (waveAnimationFrame !== null) return
  waveAnimationFrame = requestAnimationFrame(() => {
    waveAnimationFrame = null
    if (!pendingWaveTouch) return
    processWaveTouch(pendingWaveTouch)
    pendingWaveTouch = null
  })
}

const handleWaveEnd = (_e: TouchEvent) => {
  if (waveHoldTimer) {
    clearTimeout(waveHoldTimer)
    waveHoldTimer = null
    return
  }

  if (waveAnimationFrame !== null) {
    cancelAnimationFrame(waveAnimationFrame)
    waveAnimationFrame = null
  }
  pendingWaveTouch = null

  const screenWidth = window.innerWidth
  const distanceFromRight = screenWidth - touchX.value

  if (isWaving.value && activeLetter.value) {
    if (distanceFromRight > 100) {
      const apps = appsByLetter.value[activeLetter.value]
      if (apps && apps.length > 0) {
        launchApp(apps[0])
      }
    } else {
      stickyLetter.value = activeLetter.value
    }
  }

  isWaving.value = false
}

const closeFlyout = () => {
  stickyLetter.value = ''
  activeLetter.value = ''
  expandedFolder.value = null
}

// Special top-level apps
const haShortcuts = [
  { label: 'av', url: 'homeassistant://navigate/lovelace?server=av' },
  { label: 'condo', url: 'homeassistant://navigate/lovelace?server=Condo' },
]
const memoPackage = "org.fossify.voicerecorder.debug"

const updateRemainingDays = (date: Date) => {
  const cutoffShift = date.getHours() >= 17 ? 1 : 0
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${cutoffShift}`
  if (remainingDays.value === null || remainingDaysKey !== key) {
    remainingDaysKey = key
    remainingDays.value = calculateRemainingWorkingDays()
  }
}

const processWaveTouch = (touch: Touch, silent = false) => {
  const y = touch.clientY
  const x = touch.clientX
  touchY.value = y
  touchX.value = x

  const containerTop = windowHeight.value * 0.05
  const containerHeight = windowHeight.value * 0.9
  const relativeY = y - containerTop
  const letters = filteredAlphabet.value
  let index = Math.floor((relativeY / containerHeight) * letters.length)
  const newLetter = letters[Math.max(0, Math.min(index, letters.length - 1))]

  if (newLetter !== activeLetter.value) {
    activeLetter.value = newLetter
    if (!silent) triggerHaptic(18)
  }
}

const scheduleLoadData = (delay = 300) => {
  if (loadDataDebounceTimer) clearTimeout(loadDataDebounceTimer)
  loadDataDebounceTimer = setTimeout(() => {
    loadDataDebounceTimer = null
    void loadData()
  }, delay)
}

// force=true (pull-to-refresh only) bypasses every 5-min cache; mount,
// resume and app-event callers keep the caches so background triggers
// can't spam the APIs.
const loadData = async (force = false) => {
  if (loadDataInFlight) return loadDataInFlight
  loadDataInFlight = (async () => {
    try {
      const appsUrl = window.Bridge.getAppsURL()
      const t = Date.now()

      const [appsRes, foldersRes, hiddenRes, labelsRes] = await Promise.allSettled([
        fetch(appsUrl),
        fetch(`./folders.json?t=${t}`),
        fetch(`./hidden_apps.json?t=${t}`),
        fetch(`./custom_labels.json?t=${t}`)
      ])

      if (appsRes.status === 'fulfilled' && appsRes.value.ok) {
        const appsData = await appsRes.value.json()
        allApps.value = appsData.apps
      }

      if (foldersRes.status === 'fulfilled' && foldersRes.value.ok) {
        folders.value = await foldersRes.value.json()
      }

      if (hiddenRes.status === 'fulfilled' && hiddenRes.value.ok) {
        hiddenApps.value = await hiddenRes.value.json()
      } else {
        hiddenApps.value = []
      }

      if (labelsRes.status === 'fulfilled' && labelsRes.value.ok) {
        customLabels.value = await labelsRes.value.json()
      } else {
        customLabels.value = {}
      }

      updateRemainingDays(now.value)

      fetchLocation(force)
        .then(loc => {
          if (!loc) { console.warn('weather: location fetch returned null'); return null }
          return fetchWeather(loc, force)
        })
        .then(w => {
          if (w) { weather.value = w }
          else { console.warn('weather: weather fetch returned null') }
        })
        .catch(e => console.warn('weather: chain error', e))
      fetchFixedWeather(force)
        .then(w => {
          if (w) { fixedWeather.value = w }
        })
        .catch(e => console.warn('fixed weather: chain error', e))
      fetchCalendarEvents(force)
        .then(d => {
          if (d) { calendarEvents.value = d }
        })
        .catch(e => console.warn('calendar: chain error', e))
    } catch (error) {
      console.error("Failed to load launcher data:", error)
    } finally {
      loading.value = false
      loadDataInFlight = null
    }
  })()
  return loadDataInFlight
}

const refreshApps = async () => {
  try {
    const res = await fetch(window.Bridge.getAppsURL())
    if (!res.ok) return
    const apps = (await res.json()).apps
    if (Array.isArray(apps) && apps.length !== allApps.value.length) allApps.value = apps
  } catch (e) {
    console.warn('refreshApps failed', e)
  }
}

const handleResize = () => {
  windowHeight.value = window.innerHeight
}

// Haptics. Two things make navigator.vibrate() unreliable here:
//  - pulses under ~10ms are often imperceptible on the phone's LRA actuator;
//  - the spec cancels a running vibration as soon as the document becomes
//    hidden, which is exactly what launchIntent() causes a moment later. So
//    the buzz is fired as early as possible (touchstart, not click).
// minGap swallows a repeat landing on top of a previous one, since a second
// vibrate() call also cancels the first.
let lastHapticAt = 0
const triggerHaptic = (ms: number, minGap = 0) => {
  if (!('vibrate' in navigator)) return
  const t = Date.now()
  if (minGap && t - lastHapticAt < minGap) return
  lastHapticAt = t
  try {
    navigator.vibrate(ms)
  } catch {
    /* vibration unsupported or blocked */
  }
}

// --- Pull to Refresh Logic ---
const handleMainTouchStart = (e: TouchEvent) => {
  const mainEl = e.currentTarget as HTMLElement
  const touch = e.touches[0]
  // Only allow pull-to-refresh if we are at the absolute top of the scroll container
  if (mainEl.scrollTop === 0) {
    pullStartY.value = touch.clientY
  } else {
    pullStartY.value = 0
  }
}

const handleMainTouchMove = (e: TouchEvent) => {
  if (!pullStartY.value || isRefreshing.value) return
  const currentY = e.touches[0].clientY
  const distance = currentY - pullStartY.value

  // Only engage the pull once movement clears a small threshold. Below this,
  // treat the gesture as a tap and do NOT preventDefault — otherwise the tiny
  // downward finger jitter during a tap cancels the synthesized click, which
  // made folder-row taps (children of <main>) launch only intermittently.
  if (distance > pullActivationThreshold) {
    // Add resistance (measure from the activation point so there's no jump)
    pullDistance.value = Math.pow(distance - pullActivationThreshold, 0.8)
    if (e.cancelable) e.preventDefault() // Prevent overscroll bounce while pulling
  }
}

const handleMainTouchEnd = async () => {
  if (!pullStartY.value) return
  
  if (pullDistance.value > refreshThreshold) {
    isRefreshing.value = true
    triggerHaptic(15)
    pullDistance.value = refreshThreshold // Lock it at threshold
    await loadData(true)
    setTimeout(() => {
      isRefreshing.value = false
      pullDistance.value = 0
    }, 500) // Keep the "refreshing" state visible briefly
  } else {
    pullDistance.value = 0
  }
  pullStartY.value = 0
}

onMounted(() => {
  try {
    const cachedWeather = localStorage.getItem('weather_data')
    if (cachedWeather) weather.value = JSON.parse(cachedWeather)
    const cachedFixedWeather = localStorage.getItem('weather_fixed')
    if (cachedFixedWeather) fixedWeather.value = JSON.parse(cachedFixedWeather)
    const cachedCalendar = localStorage.getItem('calendar_events')
    if (cachedCalendar) calendarEvents.value = JSON.parse(cachedCalendar)
  } catch (e) {
    console.warn('weather cache hydration failed', e)
  }

  loadUsageCounts()

  updateRemainingDays(now.value)
  void loadData()
  // Right after a cold start Bridge may still be scanning installed apps and
  // return a partial list, so re-read just the app list shortly after.
  retryTimers = [2000, 6000].map(ms => setTimeout(refreshApps, ms))
  // Display is HH:MM, so tick once per minute, aligned to the boundary.
  const tickClock = () => {
    now.value = new Date()
    updateRemainingDays(now.value)
    clockTimer = setTimeout(tickClock, 60000 - (Date.now() % 60000) + 50)
  }
  clockTimer = setTimeout(tickClock, 60000 - (Date.now() % 60000) + 50)
  window.addEventListener('resize', handleResize)
  window.onBridgeEvent = (event: any) => {
    if (event.name === 'beforePause') {
      lastPauseAt = Date.now()
      closeFlyout()
    }
    if (event.name === 'newIntent') {
      handleHomeIntent()
    }
    if (event.name === 'afterResume') {
      closeFlyout()
      scheduleLoadData()
    }
    if (['appInstalled', 'appRemoved', 'appUpdated'].includes(event.name)) {
      scheduleLoadData()
    }
  }
})

onUnmounted(() => {
  if (clockTimer) clearTimeout(clockTimer)
  retryTimers.forEach(clearTimeout)
  if (loadDataDebounceTimer) clearTimeout(loadDataDebounceTimer)
  if (waveHoldTimer) clearTimeout(waveHoldTimer)
  if (waveAnimationFrame !== null) cancelAnimationFrame(waveAnimationFrame)
  window.removeEventListener('resize', handleResize)
  window.onBridgeEvent = undefined
})

// Optional per-package launch overrides. Map a package to a specific
// activity ONLY when its declared launcher is dead/wrong. Prefer leaving
// this empty: with an empty override the native handler resolves the current
// launcher activity dynamically (queryIntentActivities on MAIN/LAUNCHER),
// which is more robust than hardcoding an activity that can change between
// app updates. Amazon's hardcoded HomeActivity went stale and stopped
// launching, so it now uses the dynamic package= path below.
const launchComponentOverrides: Record<string, string> = {}
// Intent URLs go through a hidden iframe, never location.href on the launcher
// document: if the native handler declines one, the failure (error page) stays
// confined to the iframe instead of replacing the launcher.
let intentFrame: HTMLIFrameElement | null = null
const fireIntent = (url: string) => {
  if (!intentFrame) {
    intentFrame = document.createElement('iframe')
    intentFrame.style.display = 'none'
    intentFrame.setAttribute('aria-hidden', 'true')
    intentFrame.tabIndex = -1
    document.body.appendChild(intentFrame)
  }
  intentFrame.src = url
}

const launchIntent = (packageName: string) => {
  // JS API first: a Java call can never navigate the WebView.
  try {
    if (window.Bridge?.requestLaunchApp?.(packageName, false)) return
  } catch (e) {
    console.warn('requestLaunchApp failed', e)
  }
  const comp = launchComponentOverrides[packageName]
  const target = comp ? `component=${packageName}/${comp}` : `package=${packageName}`
  const intentUrl = `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;launchFlags=0x10000000;${target};end`
  fireIntent(intentUrl)
}

const fireWebUrl = (url: string) => {
  const m = url.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/)
  const scheme = m?.[1] ?? 'https'
  const rest = m?.[2] ?? url
  fireIntent(`intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;launchFlags=0x10000000;end`)
}

// Firefox for Android "Install" creates a real web app: tabs and address bar are
// gone and it lives in its own task. Firefox launches it through an exported
// WebAppLauncherActivity that reads the manifest start URL from the intent data,
// looks up the stored manifest and routes to the standalone web app shell. This
// reproduces exactly what Firefox's own pinned shortcut does, so it is
// deterministic (unlike opening the URL and hoping the default browser handles it).
//
// The start URL here is the manifest's resolved start_url
// (https://ihasmail.taisau.tv/mail) and MUST match it exactly - it is the
// storage key. On any mismatch (or if the web app is not installed) Firefox
// simply opens the URL in a normal browser tab, so a stale value degrades safely.
const firefoxWebAppPackage = 'org.mozilla.firefox'
const firefoxWebAppActivity = 'mozilla.components.feature.pwa.WebAppLauncherActivity'
const firefoxWebAppAction = 'mozilla.components.feature.pwa.PWA_LAUNCHER'
const fireWebApp = (startUrl: string) => {
  const m = startUrl.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/)
  const scheme = m?.[1] ?? 'https'
  const rest = m?.[2] ?? startUrl
  fireIntent(`intent://${rest}#Intent;scheme=${scheme};action=${firefoxWebAppAction};component=${firefoxWebAppPackage}/${firefoxWebAppActivity};launchFlags=0x10000000;end`)
}

const launchApp = (app: BridgeApp) => {
  if (!app) return;

  // Skipped when the row's touchstart already buzzed; this covers the paths
  // that have no preceding touchstart, e.g. release-to-launch from the wave.
  triggerHaptic(25, 300)

  recordUsage(app.packageName)

  if (app.action) {
    app.action()
    closeFlyout()
  } else if (app.url) {
    app.isPwa ? fireWebApp(app.url) : fireWebUrl(app.url)
    closeFlyout()
  } else if (app.packageName) {
    launchIntent(app.packageName)
  }
}

const openAppInfo = (app: BridgeApp) => {
  if (!app || !app.packageName || app.isAction) return;
  
  if (window.Bridge) {
    window.Bridge.requestOpenAppInfo(app.packageName)
  }
}

// Bridge's own activities (settings, app drawer) are opened ONLY through the JS
// API. The previous intent:// fallback is deliberately gone: an
// `intent://#Intent;component=...;end` URL has an empty authority, and rather
// than being handled it escaped to an external browser, which then tried to
// resolve the launcher's internal host and failed with
// "https://bridge.launcher could not be resolved". Bridge's own WebView can
// never produce that error - BridgeServer.handle() only returns null when the
// host is not bridge.launcher, and BridgeFileServer always returns a response -
// so the navigation had left the WebView entirely.
//
// The JS API is the correct path and APK v18 makes it reliable: Bridge
// activities are now started with FLAG_ACTIVITY_NEW_TASK, which is what was
// making requestOpenBridgeAppDrawer return false (tryRunInHomescreenContext
// falls back to webView.context, which is not guaranteed to be an Activity).
// If the API still fails we log and do nothing - a dead gesture is far better
// than a launcher replaced by a browser error page.
const openBridgeSettings = () => {
  try {
    if (window.Bridge?.requestOpenBridgeSettings?.(false)) return
    console.warn('requestOpenBridgeSettings returned false')
  } catch (e) {
    console.warn('requestOpenBridgeSettings failed', e)
  }
}

const openAppDrawer = () => {
  triggerHaptic(20)
  try {
    if (window.Bridge?.requestOpenBridgeAppDrawer?.(false)) return
    console.warn('requestOpenBridgeAppDrawer returned false (needs APK v18+)')
  } catch (e) {
    console.warn('requestOpenBridgeAppDrawer failed', e)
  }
}

// --- Android home gesture (bottom bar swipe up) -> app drawer ---
// The gesture itself CANNOT be intercepted: the bottom strip belongs to
// SystemUI and its touches are never delivered to the app
// (setSystemGestureExclusionRects only covers the left/right back edges and
// cannot claim mandatory system gestures). What we can see is the gesture
// COMPLETING: HomeScreenActivity is launchMode="singleTask" with
// CATEGORY_HOME, so the home intent is re-delivered to the running activity ->
// onNewIntent -> Bridge's "newIntent" JS event.
//
// That event also fires when returning to the launcher from another app, which
// must NOT open the drawer. Discriminating on "did we pause?" alone is not
// safe, because re-delivering an intent to a resumed activity can itself go
// through onPause/onNewIntent/onResume. Time is the reliable signal: when we
// were already on the home screen that pause (if any) is part of the same
// transaction and lands microseconds earlier, whereas coming back from a real
// app means the pause was seconds or minutes ago.
const homeIntentPauseGraceMs = 700
let lastPauseAt = 0
// A fresh start (cold boot, force-stop, version-tap reload) delivers a home
// intent too, with no pause ever seen; that must not open the drawer.
const homeIntentStartupIgnoreMs = 3000
const pageStartedAt = Date.now()

const handleHomeIntent = () => {
  // A flyout/folder open means the gesture reads as "get me out of here".
  if (isWaving.value || stickyLetter.value || expandedFolder.value) {
    closeFlyout()
    expandedFolder.value = null
    return
  }
  if (Date.now() - pageStartedAt < homeIntentStartupIgnoreMs) return
  const sincePause = Date.now() - lastPauseAt
  if (lastPauseAt !== 0 && sincePause > homeIntentPauseGraceMs) return
  openAppDrawer()
}

const toggleFolder = (folderName: string) => {
  triggerHaptic(12)
  if (expandedFolder.value === folderName) {
    expandedFolder.value = null
  } else {
    expandedFolder.value = folderName
  }
}


const formatDate = (date: Date) => {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const countdown = remainingDays.value !== null ? `(${remainingDays.value}) ` : '';
  return `${countdown}${weekday} ${year}-${month}-${day}`;
}

const formatStaleTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

const shouldShowWeatherLine = (data: WeatherData | null) => {
  return !!data && !data.isStale
}

// "remote visit... 14:20" / "camping! – 9/7" (all-day, multi-day end label)
const eventLine = (ev: CalendarDisplayEvent) => {
  const time = ev.timeLabel ? ` ${ev.timeLabel}` : ''
  const end = ev.endDateLabel ? ` – ${ev.endDateLabel}` : ''
  return `${ev.title}${time}${end}`
}
</script>

<template>
  <!-- Background Backdrop Blur when waving or sticky list shown -->
  <div 
    v-if="isWaving || stickyLetter" 
    class="fixed inset-0 bg-black/70 backdrop-blur-md z-40 transition-all duration-300"
    @click="closeFlyout"
  ></div>

  <!-- Pull to Refresh Indicator -->
  <div 
    class="fixed top-0 left-0 w-full flex justify-center items-center h-20 pointer-events-none z-30 transition-transform duration-200"
    :style="{ transform: `translateY(${Math.min(pullDistance, refreshThreshold) - refreshThreshold}px)` }"
  >
    <div class="text-[10px] tracking-widest text-gray-500 lowercase bg-black px-4 py-1 rounded-full shadow-lg">
      <span v-if="isRefreshing">refreshing...</span>
      <span v-else-if="pullDistance >= refreshThreshold">release to refresh</span>
      <span v-else :style="{ opacity: pullDistance / refreshThreshold }">pull to refresh</span>
    </div>
  </div>

  <main 
    class="h-screen w-screen flex flex-col pl-14 pr-6 pt-32 pb-12 select-none overflow-y-auto bg-black text-white"
    @click="closeFlyout"
    @touchstart.passive="handleMainTouchStart"
    @touchmove="handleMainTouchMove"
    @touchend="handleMainTouchEnd"
  >
    
    <!-- Clock Header -->
    <header class="mb-8 cursor-default" @click.stop="openBridgeSettings">
      <h1 class="text-3xl font-extrabold tracking-tighter lowercase">
        {{ now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }}
      </h1>
      <p class="text-[10px] lowercase tracking-wider text-gray-500 mt-1 pl-0.5">
        {{ formatDate(now) }}
      </p>
      <p v-if="shouldShowWeatherLine(weather)" class="text-[10px] lowercase tracking-wider text-gray-500 mt-0.5 pl-0.5">
        {{ weather!.city }} {{ weather!.tempHigh }}&deg; {{ weather!.condition }}
        <span v-if="weather!.isStale" class="opacity-50"> (last refresh {{ formatStaleTime(weather!.lastRefresh) }})</span>
      </p>
      <p v-if="shouldShowWeatherLine(fixedWeather)" class="text-[10px] lowercase tracking-wider text-gray-500 mt-0.5 pl-0.5">
        {{ fixedWeather!.city }} {{ fixedWeather!.tempHigh }}&deg; {{ fixedWeather!.condition }}
        <span v-if="fixedWeather!.isStale" class="opacity-50"> (last refresh {{ formatStaleTime(fixedWeather!.lastRefresh) }})</span>
      </p>
      <!-- Calendar: personal = gold (same as most-used), shared = dark red -->
      <template v-if="calendarEvents && calendarEvents.events.length > 0">
        <p
          v-for="(ev, i) in calendarEvents.events"
          :key="`${ev.title}-${ev.timeLabel ?? 'allday'}-${i}`"
          class="text-[10px] lowercase tracking-wider mt-0.5 pl-0.5"
          :class="ev.isShared ? 'text-[#a13d3d]' : 'text-[#c9a961]'"
        >
          {{ eventLine(ev) }}
          <span v-if="i === 0 && calendarEvents!.isStale" class="opacity-50"> (last refresh {{ formatStaleTime(calendarEvents!.lastRefresh) }})</span>
        </p>
      </template>
    </header>

    <!-- UI List -->
    <div v-if="loading" class="text-gray-700 animate-pulse lowercase text-[10px] tracking-widest pl-1">
      initializing...
    </div>
    
    <div v-else class="flex flex-col gap-5 relative z-10 transition-transform duration-200" :style="{ transform: `translateY(${isRefreshing ? refreshThreshold/2 : pullDistance / 2}px)` }">
      <!-- 1: Home Assistant (Server shortcuts) -->
      <div 
        class="flex flex-col gap-2"
        @click.stop
      >
        <div 
          class="flex items-center gap-3 cursor-pointer active:opacity-50 transition-all"
          @click.stop="showHaMenu = !showHaMenu"
        >
          <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
            1 ha
          </span>
          <span class="text-[9px] text-gray-600 font-mono tracking-widest lowercase">
            {{ haShortcuts.length }}
          </span>
        </div>

        <div 
          v-if="showHaMenu" 
          class="flex flex-col gap-3 pl-3 ml-0.5 py-1"
        >
          <div 
            v-for="ha in haShortcuts" 
            :key="ha.label"
            class="flex items-center cursor-pointer active:opacity-50 transition-all"
            @click.stop="showHaMenu = false; recordUsage(haUsageKey(ha.label)); fireWebUrl(ha.url)"
          >
            <span
              class="text-[15px] font-extrabold tracking-tight lowercase"
              :class="topHaShortcut === ha.label ? 'text-[#c9a961]' : 'text-gray-400'"
            >
              {{ ha.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- 2-5: The Folders -->
      <template v-for="(_, folderName) in folders" :key="folderName">
        <div 
          v-if="(folderAppsMap[folderName as string] || []).length > 0"
          class="flex flex-col gap-2"
          @click.stop
        >
          <div 
            class="flex items-center gap-3 cursor-pointer active:opacity-50 transition-all"
            @click.stop="toggleFolder(folderName as string)"
          >
            <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
              {{ folderName }}
            </span>
            <span class="text-[9px] text-gray-600 font-mono tracking-widest lowercase">
              {{ (folderAppsMap[folderName as string] || []).length }}
            </span>
          </div>

          <div 
            v-if="expandedFolder === folderName" 
            class="flex flex-col gap-3 pl-3 ml-0.5 py-1"
          >
            <div 
              v-for="app in (folderAppsMap[folderName as string] || [])" 
              :key="app.packageName"
              class="flex items-center gap-4 cursor-pointer active:opacity-50 transition-all"
              @click.stop="launchApp(app)"
              @contextmenu.prevent.stop="openAppInfo(app)"
            >
              <span
                class="text-[15px] font-extrabold tracking-tight lowercase"
                :class="isTopUsed(folderName as string, app.packageName) ? 'text-[#c9a961]' : 'text-gray-400'"
              >{{ app.label }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 6: ai (Termux -> ssh ai -> nnp) -->
      <div
        class="flex items-center cursor-pointer active:opacity-50 transition-all"
        @click.stop="launchApp({ packageName: 'com.termux', label: '6 ai' })"
      >
        <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
          6 ai
        </span>
      </div>

      <!-- 7: The Memo App -->
      <div 
        class="flex items-center cursor-pointer active:opacity-50 transition-all"
        @click.stop="launchApp({ packageName: memoPackage, label: '7 memo' })"
      >
        <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
          7 memo
        </span>
      </div>
    </div>

    <!-- Alphabet Wave Strip (Right Edge Trigger) -->
    <div 
      class="fixed right-0 w-32 z-50 flex flex-col justify-between py-2 items-center"
      :style="{ top: '5vh', height: '90vh' }"
      @touchstart.passive.stop="handleWaveStart"
      @touchmove.passive.stop="handleWaveMove"
      @touchend.passive.stop="handleWaveEnd"
    >
      <div 
        v-for="(char, index) in filteredAlphabet" 
        :key="char"
        class="text-[8px] font-extrabold text-gray-600 transition-all duration-100 ease-out will-change-transform"
        :style="getLetterStyle(char, index)"
      >
        {{ char }}
      </div>
    </div>

    <!-- Active/Sticky Flyout List -->
    <div 
      v-if="(isWaving || stickyLetter) && (activeLetter || stickyLetter) && appsByLetter[activeLetter || stickyLetter]"
      class="fixed z-50 flex flex-col no-scrollbar"
      :style="{ 
        top: `${Math.max(30, Math.min(touchY - 60, windowHeight - Math.min(windowHeight * 0.8, appsByLetter[activeLetter || stickyLetter].length * 52 + 100) - 40))}px`, 
        left: '3.5rem',
        maxHeight: '80vh'
      }"
    >
      <!-- Letter Header -->
      <div class="mb-2 pb-1 shrink-0">
        <span class="text-[17px] font-extrabold text-gray-500 tracking-widest lowercase">
          {{ activeLetter || stickyLetter }}
        </span>
      </div>

      <div class="flex flex-col gap-4 overflow-y-auto no-scrollbar pb-20">
        <div 
          v-for="app in appsByLetter[activeLetter || stickyLetter]" 
          :key="app.packageName"
          class="flex items-center py-2 cursor-pointer active:opacity-50 transition-all shrink-0"
          @touchstart.passive="triggerHaptic(25, 300)"
          @click.stop="launchApp(app)"
          @contextmenu.prevent.stop="openAppInfo(app)"
        >
          <span class="text-[15px] font-extrabold text-white tracking-tight leading-tight lowercase">
            {{ app.label }}
          </span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
main {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
main::-webkit-scrollbar {
  display: none;
}
main {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.will-change-transform {
  will-change: transform, opacity;
}
</style>