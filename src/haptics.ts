// Haptics. Two things make navigator.vibrate() unreliable here:
//  - pulses under ~10ms are often imperceptible on the phone's LRA actuator;
//  - the spec cancels a running vibration as soon as the document becomes
//    hidden, which is exactly what launchIntent() causes a moment later. So
//    the buzz is fired as early as possible (touchstart, not click).
// minGap swallows a repeat landing on top of a previous one, since a second
// vibrate() call also cancels the first.
let lastHapticAt = 0
export const triggerHaptic = (ms: number, minGap = 0) => {
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

// Native system haptic (APK v27+): the same engine as keyboard typing, so it is
// far softer than navigator.vibrate(), which has no amplitude control.
// 27 = HapticFeedbackConstants.SEGMENT_FREQUENT_TICK, made for scrubbing.
const SEGMENT_FREQUENT_TICK = 27
export const triggerTick = (minGap = 0) => {
  const t = Date.now()
  if (minGap && t - lastHapticAt < minGap) return
  lastHapticAt = t
  const native = (window.Bridge as unknown as { performHaptic?: (c: number) => void } | undefined)?.performHaptic
  if (typeof native === 'function') {
    try {
      native.call(window.Bridge, SEGMENT_FREQUENT_TICK)
      return
    } catch {
      /* fall through to the web vibration */
    }
  }
  triggerHaptic(5)
}
