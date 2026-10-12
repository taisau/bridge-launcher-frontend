import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Import Bridge API Mock for local desktop development
import { BridgeMock } from '@bridgelauncher/api-mock'

// If window.Bridge is undefined, it means we are not running inside the Android launcher.
// Initialize the mock so we can test the UI in a desktop browser.
if (!window.Bridge) {
  window.Bridge = new BridgeMock({
    logWallpaperEvents: true,
    appsUrl: './apps.json',
  } as any)
} else {
  // Prevent Android back gesture from escaping the home screen
  // by maintaining history entries so the WebView BackHandler stays active
  // Keep exactly ONE guard entry above the base entry. Pushing unconditionally
  // on every load grew the stack by two on each reload, which is what made
  // recovering from an error page take many back-swipes.
  if (!history.state?.bridgeGuard) {
    history.replaceState({ bridgeBase: true }, '', location.href)
    history.pushState({ bridgeGuard: true }, '', location.href)
  }
  window.addEventListener('popstate', (e) => {
    if (e.state?.bridgeGuard) return
    setTimeout(() => {
      history.replaceState({ bridgeBase: true }, '', location.href)
      history.pushState({ bridgeGuard: true }, '', location.href)
    })
  })
}

createApp(App).mount('#app')
