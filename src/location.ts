export interface LocationData {
  lat: number
  lon: number
  city: string
  timestamp: number
}

interface HomeAssistantConfig {
  baseUrl: string
  token: string
  entityId: string
}

interface HomeAssistantState {
  state?: string
  attributes?: {
    latitude?: number | string
    longitude?: number | string
    friendly_name?: string
  }
}

import { safeGetStorage, safeSetStorage } from './storage'

let _haConfig: HomeAssistantConfig | null | undefined

function safeParseLocation(raw: string | null): LocationData | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') return parsed
    console.warn('location cache parse: invalid shape for weather_location')
  } catch (e) {
    console.warn('location cache parse: invalid JSON for weather_location', e)
  }
  return null
}

async function loadHomeAssistantConfig(): Promise<HomeAssistantConfig | null> {
  if (_haConfig !== undefined) return _haConfig

  try {
    const res = await fetch(`./ha-config.json?t=${Date.now()}`)
    if (!res.ok) {
      _haConfig = null
      return null
    }
    const config = await res.json()
    if (typeof config.baseUrl !== 'string' || typeof config.token !== 'string' || typeof config.entityId !== 'string') {
      _haConfig = null
      return null
    }
    _haConfig = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      token: config.token,
      entityId: config.entityId
    }
    return _haConfig
  } catch (e) {
    console.warn('home assistant config fetch error:', e)
    _haConfig = null
    return null
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'User-Agent': 'BridgeLauncher/1.0' } }
    )
    if (!res.ok) return 'local'
    const data = await res.json()
    const a = data.address || {}
    return (a.city || a.town || a.suburb || a.neighbourhood || a.hamlet || a.village || a.quarter || 'local').toLowerCase()
  } catch {
    return 'local'
  }
}

async function fetchHomeAssistantLocation(): Promise<LocationData | null> {
  const config = await loadHomeAssistantConfig()
  if (!config) return null

  const res = await fetch(`${config.baseUrl}/api/states/${encodeURIComponent(config.entityId)}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json'
    },
    credentials: 'omit'
  })
  if (!res.ok) throw new Error(`Home Assistant location failed: ${res.status}`)

  const data: HomeAssistantState = await res.json()
  const lat = Number(data.attributes?.latitude)
  const lon = Number(data.attributes?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Home Assistant location missing coordinates')

  const city = await reverseGeocode(lat, lon)

  return {
    lat,
    lon,
    city,
    timestamp: Date.now()
  }
}

export async function fetchLocation(forceRefresh = false): Promise<LocationData | null> {
  const FIVE_MINUTES = 5 * 60 * 1000
  const cached = safeParseLocation(safeGetStorage('weather_location'))

  if (!forceRefresh && cached && (Date.now() - cached.timestamp < FIVE_MINUTES)) {
    return cached
  }

  try {
    const result = await fetchHomeAssistantLocation()
    if (result) {
      safeSetStorage('weather_location', JSON.stringify(result))
      return result
    }
  } catch (e) {
    console.warn('home assistant location fetch error:', e)
  }

  return cached
}
