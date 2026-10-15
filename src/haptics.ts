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
