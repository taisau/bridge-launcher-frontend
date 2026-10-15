import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// If window.Bridge is undefined, it means we are not running inside the Android launcher.
// Initialize the mock so we can test the UI in a desktop browser.
const installMock = async () => {
  // Dynamic import keeps the mock out of the phone bundle (its own chunk,
  // only fetched on desktop).
  const { BridgeMock } = await import('@bridgelauncher/api-mock')
  window.Bridge = new BridgeMock({
    logWallpaperEvents: true,
    appsUrl: './apps.json',
  } as any)
}

if (window.Bridge) {
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

// On the phone Bridge is injected before the page runs, so mount right away.
const mount = () => createApp(App).mount('#app')
if (window.Bridge) mount()
else void installMock().then(mount)
