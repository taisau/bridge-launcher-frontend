import type { LocationData } from './location'
import { safeGetStorage, safeSetStorage } from './storage'

export interface WeatherData {
  city: string
  tempHigh: number
  condition: string
  lastRefresh: number
  isStale?: boolean
}

const WMO_CODES: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  61: 'rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'rain showers',
  81: 'rain showers',
  82: 'heavy rain showers',
  85: 'snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'heavy thunderstorm'
}

function safeParseWeather(raw: string | null): WeatherData | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.city === 'string' && typeof parsed.tempHigh === 'number' && typeof parsed.condition === 'string') return parsed
    console.warn('weather cache parse: invalid shape')
  } catch (e) {
    console.warn('weather cache parse: invalid JSON', e)
  }
  return null
}

function weatherCacheKey(loc: LocationData): string {
  return `weather_data_${loc.lat.toFixed(1)}_${loc.lon.toFixed(1)}`
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<{ tempHigh: number; condition: string }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&current=weather_code&timezone=auto&forecast_days=1&temperature_unit=fahrenheit`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`)
  const data = await res.json()
  const tempHigh = Number(data.daily?.temperature_2m_max?.[0])
  const weatherCode = Number(data.current?.weather_code)
  if (!Number.isFinite(tempHigh) || !Number.isFinite(weatherCode)) throw new Error('Weather response missing forecast data')
  return {
    tempHigh: Math.round(tempHigh),
    condition: WMO_CODES[weatherCode] || 'unknown'
  }
}

export async function fetchWeather(
  loc: LocationData,
  forceRefresh = false
): Promise<WeatherData | null> {
  const FIVE_MINUTES = 5 * 60 * 1000
  const key = weatherCacheKey(loc)
  const cached = safeParseWeather(safeGetStorage(key)) || safeParseWeather(safeGetStorage('weather_data'))

  if (!forceRefresh && cached && (Date.now() - cached.lastRefresh < FIVE_MINUTES)) {
    return cached
  }

  try {
    const weather = await fetchOpenMeteo(loc.lat, loc.lon)
    const result: WeatherData = {
      city: loc.city,
      tempHigh: weather.tempHigh,
      condition: weather.condition,
      lastRefresh: Date.now()
    }
    safeSetStorage(key, JSON.stringify(result))
    safeSetStorage('weather_data', JSON.stringify(result))
    return result
  } catch (e) {
    console.warn('weather fetch error:', e)
    if (cached) return { ...cached, isStale: true }
    return null
  }
}

const FIXED_LAT = 21.015639
const FIXED_LON = -101.252944

export async function fetchFixedWeather(
  forceRefresh = false
): Promise<WeatherData | null> {
  const FIVE_MINUTES = 5 * 60 * 1000
  const cached = safeParseWeather(safeGetStorage('weather_fixed'))

  if (!forceRefresh && cached && (Date.now() - cached.lastRefresh < FIVE_MINUTES)) {
    return cached
  }

  try {
    const weather = await fetchOpenMeteo(FIXED_LAT, FIXED_LON)
    const result: WeatherData = {
      city: 'guanajuato',
      tempHigh: weather.tempHigh,
      condition: weather.condition,
      lastRefresh: Date.now()
    }
    safeSetStorage('weather_fixed', JSON.stringify(result))
    return result
  } catch (e) {
    console.warn('fixed weather fetch error:', e)
    if (cached) return { ...cached, isStale: true }
    return null
  }
}
