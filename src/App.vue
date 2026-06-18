<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { calculateRemainingWorkingDays } from './countdown'
import { fetchLocation } from './location'
import { fetchWeather, fetchFixedWeather, type WeatherData } from './weather'

declare const __APP_VERSION__: string;

interface BridgeApp {
  packageName: string
  label: string
  url?: string
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
const remainingDays = ref<number | null>(null)
const weather = ref<WeatherData | null>(null)
const fixedWeather = ref<WeatherData | null>(null)
const apkVersion = 'apk v9'
const version = `v${__APP_VERSION__} · ${apkVersion}`
const now = ref(new Date())
let clockTimer: any
let retryTimer: any
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
        const app = appPackageMap.value[item]
        if (app) {
          return { ...app, label: customLabels.value[app.packageName] || app.label }
        }
        return undefined
      })
      .filter((app): app is BridgeApp => !!app)
  })
  return map
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
    { label: 'settings', packageName: 'action:settings', isAction: true, action: () => window.Bridge.requestOpenBridgeSettings() },
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

const pullStartY = ref(0)
const pullDistance = ref(0)
const isRefreshing = ref(false)
const refreshThreshold = 100

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

  const activeIndex = filteredAlphabet.value.indexOf(activeLetter.value)
  const distanceFromActive = Math.abs(index - activeIndex)

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

  if (waveHoldTimer) clearTimeout(waveHoldTimer)

  waveHoldTimer = setTimeout(() => {
    isWaving.value = true
    stickyLetter.value = ''
    if ('vibrate' in navigator) navigator.vibrate(10)
    handleWaveMove(e)
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
const haPackage = "io.homeassistant.companion.android"
const assistantPackage = "com.kagi.search"
const memoPackage = "org.fossify.voicerecorder.debug"

const updateRemainingDays = (date: Date) => {
  const cutoffShift = date.getHours() >= 17 ? 1 : 0
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${cutoffShift}`
  if (remainingDays.value === null || remainingDaysKey !== key) {
    remainingDaysKey = key
    remainingDays.value = calculateRemainingWorkingDays()
  }
}

const processWaveTouch = (touch: Touch) => {
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
    if ('vibrate' in navigator) navigator.vibrate(5)
  }
}

const scheduleLoadData = (delay = 300) => {
  if (loadDataDebounceTimer) clearTimeout(loadDataDebounceTimer)
  loadDataDebounceTimer = setTimeout(() => {
    loadDataDebounceTimer = null
    void loadData()
  }, delay)
}

const loadData = async () => {
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

      if (appsRes.status === 'fulfilled') {
        const appsData = await appsRes.value.json()
        allApps.value = appsData.apps
      }

      if (foldersRes.status === 'fulfilled') {
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

      fetchLocation()
        .then(loc => {
          if (!loc) { console.warn('weather: location fetch returned null'); return null }
          return fetchWeather(loc)
        })
        .then(w => {
          if (w) { weather.value = w }
          else { console.warn('weather: weather fetch returned null') }
        })
        .catch(e => console.warn('weather: chain error', e))
      fetchFixedWeather()
        .then(w => {
          if (w) { fixedWeather.value = w }
        })
        .catch(e => console.warn('fixed weather: chain error', e))
    } catch (error) {
      console.error("Failed to load launcher data:", error)
    } finally {
      loading.value = false
      loadDataInFlight = null
    }
  })()
  return loadDataInFlight
}

const handleResize = () => {
  windowHeight.value = window.innerHeight
}

const triggerHaptic = (ms: number) => {
  if ('vibrate' in navigator) navigator.vibrate(ms)
}

// --- Pull to Refresh Logic ---
const handleMainTouchStart = (e: TouchEvent) => {
  const mainEl = e.currentTarget as HTMLElement
  // Only allow pull-to-refresh if we are at the absolute top of the scroll container
  if (mainEl.scrollTop === 0) {
    pullStartY.value = e.touches[0].clientY
  } else {
    pullStartY.value = 0
  }
}

const handleMainTouchMove = (e: TouchEvent) => {
  if (!pullStartY.value || isRefreshing.value) return
  const currentY = e.touches[0].clientY
  const distance = currentY - pullStartY.value
  
  if (distance > 0) {
    // Add resistance
    pullDistance.value = Math.pow(distance, 0.8)
    if (e.cancelable) e.preventDefault() // Prevent overscroll bounce while pulling
  }
}

const handleMainTouchEnd = async () => {
  if (!pullStartY.value) return
  
  if (pullDistance.value > refreshThreshold) {
    isRefreshing.value = true
    triggerHaptic(15)
    pullDistance.value = refreshThreshold // Lock it at threshold
    await loadData()
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
  } catch (e) {
    console.warn('weather cache hydration failed', e)
  }

  updateRemainingDays(now.value)
  void loadData()
  retryTimer = setTimeout(() => scheduleLoadData(0), 2000)
  clockTimer = setInterval(() => {
    now.value = new Date()
    updateRemainingDays(now.value)
  }, 1000)
  window.addEventListener('resize', handleResize)
  window.onBridgeEvent = (event: any) => {
    if (event.name === 'beforePause') {
      closeFlyout()
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
  if (clockTimer) clearInterval(clockTimer)
  if (retryTimer) clearTimeout(retryTimer)
  if (loadDataDebounceTimer) clearTimeout(loadDataDebounceTimer)
  if (waveHoldTimer) clearTimeout(waveHoldTimer)
  if (waveAnimationFrame !== null) cancelAnimationFrame(waveAnimationFrame)
  window.removeEventListener('resize', handleResize)
  window.onBridgeEvent = undefined
})

const launchIntent = (packageName: string) => {
  const intent = `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;launchFlags=0x10000000;package=${packageName};end`
  const a = document.createElement('a')
  a.href = intent
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const attemptLaunchWithRetry = (packageName: string, retries = 10) => {
  const success = window.Bridge.requestLaunchApp(packageName, false)
  if (success) return
  if (retries > 0) {
    setTimeout(() => attemptLaunchWithRetry(packageName, retries - 1), 500)
    return
  }
  launchIntent(packageName)
}

const launchApp = (app: BridgeApp) => {
  if (!app) return;

  triggerHaptic(10)

  if (app.action) {
    app.action()
    closeFlyout()
  } else if (app.url) {
    window.open(app.url, '_blank')
    closeFlyout()
  } else if (app.packageName) {
    launchIntent(app.packageName)
    attemptLaunchWithRetry(app.packageName)
  }
}

const openAppInfo = (app: BridgeApp) => {
  if (!app || !app.packageName || app.isAction) return;
  
  if (window.Bridge) {
    window.Bridge.requestOpenAppInfo(app.packageName)
  }
}

const openBridgeSettings = () => {
  if (window.Bridge) {
    window.Bridge.requestOpenBridgeSettings()
  }
}

const toggleFolder = (folderName: string) => {
  triggerHaptic(2)
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
    </header>

    <!-- UI List -->
    <div v-if="loading" class="text-gray-700 animate-pulse lowercase text-[10px] tracking-widest pl-1">
      initializing...
    </div>
    
    <div v-else class="flex flex-col gap-5 relative z-10 transition-transform duration-200" :style="{ transform: `translateY(${isRefreshing ? refreshThreshold/2 : pullDistance / 2}px)` }">
      <!-- 1: Home Assistant (Direct link) -->
      <div 
        class="flex items-center cursor-pointer active:opacity-50 transition-all"
        @click.stop="launchApp({ packageName: haPackage, label: '1 ha' })"
      >
        <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
          1 ha
        </span>
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
              class="flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
              @click.stop="launchApp(app)"
              @contextmenu.prevent.stop="openAppInfo(app)"
            >
              <span class="text-[15px] font-extrabold text-gray-400 tracking-tight lowercase">{{ app.label }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 6: The Assistant App -->
      <div 
        class="flex items-center cursor-pointer active:opacity-50 transition-all"
        @click.stop="launchApp({ packageName: assistantPackage, label: '6 assistant' })"
      >
        <span class="text-[15px] font-extrabold tracking-tight text-gray-300 hover:text-white transition-colors lowercase">
          6 assistant
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
