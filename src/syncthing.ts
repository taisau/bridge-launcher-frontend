import { loadCalendarConfig } from './calendar'

export interface SyncStatus {
  busy: boolean
  offline: boolean
  label: string
}

interface ProxyStatus {
  ok: boolean
  state?: string
  pullBytes?: number
  completion?: number
}

// Syncthing folder states shown when there is nothing to pull; anything else is
// not busy. 'error' is shown too so a broken folder is not mistaken for idle.
const STATE_LABELS: Record<string, string> = {
  scanning: 'scanning',
  'scan-waiting': 'waiting to scan',
  'sync-waiting': 'waiting to sync',
  'sync-preparing': 'preparing',
  syncing: 'syncing',
  cleaning: 'cleaning',
  'clean-waiting': 'waiting to clean',
  error: 'sync error'
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} gb`
  if (n >= 1e6) return `${Math.round(n / 1e6)} mb`
  return `${Math.max(1, Math.round(n / 1e3))} kb`
}

// Reads the phone-local ha-proxy /syncthing route (Syncthing's own REST API
// has no CORS headers and needs its API key, which only the proxy holds).
// Returns null when the proxy itself is unreachable, so the row stays hidden.
export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  try {
    const config = await loadCalendarConfig()
    if (!config) return null
    const res = await fetch(`${config.proxyUrl}/syncthing`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const s: ProxyStatus = await res.json()
    if (!s.ok) return { busy: true, offline: true, label: 'sync offline' }
    const pull = s.pullBytes ?? 0
    const completion = s.completion ?? 100
    const busy = (s.state ?? '') in STATE_LABELS || pull > 0 || completion < 100
    if (!busy) return { busy: false, offline: false, label: '' }
    const label = pull > 0 ? `\u2193 ${formatBytes(pull)}` : (STATE_LABELS[s.state ?? ''] ?? 'sync')
    return { busy: true, offline: false, label }
  } catch {
    return null
  }
}
