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
  // Try to force portrait mode natively via the webview
  try {
    screen.orientation.lock('portrait').catch(e => console.warn('Orientation lock not supported/allowed:', e))
  } catch (e) {
    console.warn('Orientation lock failed:', e)
  }
}

createApp(App).mount('#app')
