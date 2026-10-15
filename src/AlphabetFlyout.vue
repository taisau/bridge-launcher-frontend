<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { BridgeApp } from './types'
import { triggerHaptic } from './haptics'

// The right-edge letter strip and its flyout list. Owns all wave state so a
// finger moving along the strip re-renders only this subtree, not the whole
// launcher.
const props = defineProps<{ appsByLetter: Record<string, BridgeApp[]> }>()
const emit = defineEmits<{
  launch: [app: BridgeApp]
  appInfo: [app: BridgeApp]
}>()

const alphabet = '#abcdefghijklmnopqrstuvwxyz'.split('')
const filteredAlphabet = computed(() => {
  const letters = alphabet.filter(char => props.appsByLetter[char]?.length > 0)
  return [...letters, 'bridge']
})

const isWaving = ref(false)
const stickyLetter = ref('')
const activeLetter = ref('')
const touchY = ref(0)
const touchX = ref(0)
const windowHeight = ref(window.innerHeight)

let waveHoldTimer: ReturnType<typeof setTimeout> | null = null
let waveAnimationFrame: number | null = null
let pendingWaveTouch: Touch | null = null
let initialTouch = { x: 0, y: 0 }
let lastTouch: Touch | null = null

const activeIndex = computed(() => filteredAlphabet.value.indexOf(activeLetter.value))
const isOpen = computed(() => isWaving.value || !!stickyLetter.value)
const shownLetter = computed(() => activeLetter.value || stickyLetter.value)

// Fisheye effect calculation
const scaleByDistance: Record<number, number> = {
  0: 2.5, 1: 2.0, 2: 1.7, 3: 1.5, 4: 1.35, 5: 1.2, 6: 1.1, 7: 1.05
}
const opacityByDistance: Record<number, number> = {
  0: 1.0, 1: 0.9, 2: 0.75, 3: 0.6, 4: 0.45, 5: 0.35, 6: 0.28, 7: 0.22
}
const translateXByDistance: Record<number, number> = {
  0: -60, 1: -52, 2: -42, 3: -33, 4: -24, 5: -15, 6: -8, 7: -3
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

const flyoutTop = computed(() => {
  const count = props.appsByLetter[shownLetter.value]?.length ?? 0
  const maxTop = windowHeight.value - Math.min(windowHeight.value * 0.8, count * 52 + 100) - 40
  return Math.max(30, Math.min(touchY.value - 60, maxTop))
})

const processWaveTouch = (touch: Touch, silent = false) => {
  const y = touch.clientY
  touchY.value = y
  touchX.value = touch.clientX

  const containerTop = windowHeight.value * 0.05
  const containerHeight = windowHeight.value * 0.9
  const relativeY = y - containerTop
  const letters = filteredAlphabet.value
  const index = Math.floor((relativeY / containerHeight) * letters.length)
  const newLetter = letters[Math.max(0, Math.min(index, letters.length - 1))]

  if (newLetter !== activeLetter.value) {
    activeLetter.value = newLetter
    if (!silent) triggerHaptic(18)
  }
}

const clearPendingWork = () => {
  if (waveHoldTimer) {
    clearTimeout(waveHoldTimer)
    waveHoldTimer = null
  }
  if (waveAnimationFrame !== null) {
    cancelAnimationFrame(waveAnimationFrame)
    waveAnimationFrame = null
  }
  pendingWaveTouch = null
}

const handleWaveStart = (e: TouchEvent) => {
  const touch = e.touches[0]
  initialTouch = { x: touch.clientX, y: touch.clientY }
  lastTouch = touch

  if (waveHoldTimer) clearTimeout(waveHoldTimer)

  waveHoldTimer = setTimeout(() => {
    waveHoldTimer = null
    isWaving.value = true
    stickyLetter.value = ''
    // Process the latest touch synchronously and silently: a letter-change
    // buzz a frame later would cancel this 20 ms activation pulse.
    if (lastTouch) processWaveTouch(lastTouch, true)
    triggerHaptic(20)
  }, 100)
}

const handleWaveMove = (e: TouchEvent) => {
  const touch = e.touches[0]
  lastTouch = touch

  if (!isWaving.value) {
    if (waveHoldTimer) {
      const drift = Math.hypot(touch.clientX - initialTouch.x, touch.clientY - initialTouch.y)
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

const handleWaveEnd = () => {
  if (waveHoldTimer) {
    // Released before the hold elapsed: it was a tap, not a wave.
    clearPendingWork()
    return
  }
  clearPendingWork()

  const distanceFromRight = window.innerWidth - touchX.value

  if (isWaving.value && activeLetter.value) {
    if (distanceFromRight > 100) {
      const apps = props.appsByLetter[activeLetter.value]
      if (apps && apps.length > 0) emit('launch', apps[0])
    } else {
      stickyLetter.value = activeLetter.value
    }
  }

  isWaving.value = false
}

// The system took the touch over (e.g. the back gesture starts on this edge):
// touchend never arrives. Close everything without launching or going sticky.
const handleWaveCancel = () => {
  clearPendingWork()
  isWaving.value = false
  activeLetter.value = ''
  stickyLetter.value = ''
}

const close = () => {
  stickyLetter.value = ''
  activeLetter.value = ''
}

const handleResize = () => {
  windowHeight.value = window.innerHeight
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => {
  clearPendingWork()
  window.removeEventListener('resize', handleResize)
})

defineExpose({ close, isOpen })
</script>

<template>
  <!-- Background Backdrop Blur when waving or sticky list shown -->
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black/70 backdrop-blur-md z-40 transition-all duration-300"
    @click="close"
  ></div>

  <!-- Alphabet Wave Strip (Right Edge Trigger) -->
  <div
    class="fixed right-0 w-32 z-50 flex flex-col justify-between py-2 items-center"
    :style="{ top: '5vh', height: '90vh' }"
    @touchstart.passive.stop="handleWaveStart"
    @touchmove.passive.stop="handleWaveMove"
    @touchend.passive.stop="handleWaveEnd"
    @touchcancel.passive.stop="handleWaveCancel"
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
    v-if="isOpen && shownLetter && appsByLetter[shownLetter]"
    class="fixed z-50 flex flex-col no-scrollbar"
    :style="{ top: `${flyoutTop}px`, left: '3.5rem', maxHeight: '80vh' }"
  >
    <!-- Letter Header -->
    <div class="mb-2 pb-1 shrink-0">
      <span class="text-[17px] font-extrabold text-gray-500 tracking-widest lowercase">
        {{ shownLetter }}
      </span>
    </div>

    <div class="flex flex-col gap-4 overflow-y-auto no-scrollbar pb-20">
      <div
        v-for="app in appsByLetter[shownLetter]"
        :key="app.packageName"
        class="flex items-center py-2 cursor-pointer active:opacity-50 transition-all shrink-0"
        @touchstart.passive="triggerHaptic(25, 300)"
        @click.stop="emit('launch', app)"
        @contextmenu.prevent.stop="emit('appInfo', app)"
      >
        <span class="text-[15px] font-extrabold text-white tracking-tight leading-tight lowercase">
          {{ app.label }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.will-change-transform {
  will-change: transform, opacity;
}
</style>
