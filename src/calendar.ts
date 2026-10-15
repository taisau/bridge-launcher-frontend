import { safeGetStorage, safeSetStorage } from './storage'

export interface CalendarDisplayEvent {
  timeLabel: string | null // "14:20" or null for all-day
  title: string
  endDateLabel: string | null // "9/7" for multi-day events
  isShared: boolean
}

export interface CalendarData {
  events: CalendarDisplayEvent[]
  lastRefresh: number
  dateKey?: string // local date the events were fetched for; a cache from another day is never shown
  isStale?: boolean
}

interface CalendarConfig {
  proxyUrl: string
  user: string
  sharedAccountName: string
}

interface JmapEvent {
  title?: string
  start?: string
  utcStart?: string
  duration?: string
  showWithoutTime?: boolean
}

const CALENDAR_CACHE_KEY = 'calendar_events'
const FIVE_MINUTES = 5 * 60 * 1000
const MAX_EVENTS = 4

let _calendarConfig: CalendarConfig | null | undefined

// Date handling, verified against live Stalwart data (2026-09-10): BOTH
// all-day AND timed events come back with `start` WITHOUT a Z suffix —
// all-day as floating local wall time ("2026-09-07T00:00:00"), timed as the
// UTC wall time ("2026-09-10T22:20:00" = 15:20 PDT, timeZone Etc/UTC). The
// unambiguous UTC instant for timed events is `utcStart` ("...Z"). Slicing or
// naively parsing `start` yields UTC times (22:20 instead of 15:20) and the
// wrong date for evening events. So: timed events read everything from
// utcStart (converted to device-local for display); all-day events must keep
// using `start` (their utcStart is that date at 00:00 UTC, the PREVIOUS day
// in UTC-7 — never use it for all-day).
function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isAllDay(ev: JmapEvent): boolean {
  return !!ev.showWithoutTime || /^P\d+D$/.test(ev.duration || '')
}

// The effective start instant: utcStart for timed, floating-local start for
// all-day. Invalid/unparseable dates become NaN and are filtered out.
function effectiveStart(ev: JmapEvent): Date {
  const raw = isAllDay(ev) ? ev.start || '' : ev.utcStart || ev.start || ''
  return new Date(raw)
}

function isToday(ev: JmapEvent): boolean {
  const d = effectiveStart(ev)
  if (isNaN(d.getTime())) return false
  return localDateKey(d) === localDateKey(new Date())
}

// JMAP after/before are UTC instants; a window of -1/+2 days around local
// midnight covers any event whose local start date is today regardless of
// timezone offset. Exact filtering happens on `start` in isToday().
function queryWindow(): { after: string; before: string } {
  const now = new Date()
  const after = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const before = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  return { after: after.toISOString(), before: before.toISOString() }
}

// Cached events belong to the day they were fetched for. After midnight they
// would show yesterday's calendar as today's, so such a cache counts as absent.
export function isCalendarCurrent(data: CalendarData | null): data is CalendarData {
  return !!data && data.dateKey === localDateKey(new Date())
}

export function loadCachedCalendar(): CalendarData | null {
  const cached = safeParseCalendar(safeGetStorage(CALENDAR_CACHE_KEY))
  return isCalendarCurrent(cached) ? cached : null
}

function safeParseCalendar(raw: string | null): CalendarData | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.events) && typeof parsed.lastRefresh === 'number') return parsed
    console.warn('calendar cache parse: invalid shape for calendar_events')
  } catch (e) {
    console.warn('calendar cache parse: invalid JSON', e)
  }
  return null
}

async function loadCalendarConfig(): Promise<CalendarConfig | null> {
  if (_calendarConfig !== undefined) return _calendarConfig

  try {
    const res = await fetch(`./calendar-config.json?t=${Date.now()}`)
    if (!res.ok) {
      _calendarConfig = null
      return null
    }
    const config = await res.json()
    if (
      typeof config.proxyUrl !== 'string' ||
      typeof config.user !== 'string' ||
      typeof config.sharedAccountName !== 'string'
    ) {
      _calendarConfig = null
      return null
    }
    _calendarConfig = {
      proxyUrl: config.proxyUrl.replace(/\/$/, ''),
      user: config.user,
      sharedAccountName: config.sharedAccountName
    }
    return _calendarConfig
  } catch (e) {
    console.warn('calendar config fetch error:', e)
    _calendarConfig = null
    return null
  }
}

// Transport runs through the phone-local ha-proxy (localhost:8081) because
// Stalwart's CORS preflight responses never include access-control-allow-origin
// (any origin, any authenticated method), so the WebView blocks every direct
// JMAP request. The proxy injects credentials from a phone-only file — the
// password never reaches the synced frontend tree.
// Account ids are resolved dynamically from the session object by account
// NAME so they can never drift (Stalwart's short ids like "d"/"f" are opaque).
async function resolveAccountIds(config: CalendarConfig): Promise<{ personal: string; shared: string }> {
  const res = await fetch(`${config.proxyUrl}/jmap-session`, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`JMAP session failed: ${res.status}`)
  const session = await res.json()
  const accounts = session.accounts || {}
  let personal: string | null = null
  let shared: string | null = null
  for (const [id, account] of Object.entries<{ name?: string }>(accounts)) {
    if (account.name === config.user) personal = id
    if (account.name === config.sharedAccountName) shared = id
  }
  if (!personal || !shared) throw new Error('JMAP session missing personal or shared account')
  return { personal, shared }
}

async function fetchTodayEvents(config: CalendarConfig): Promise<CalendarDisplayEvent[]> {
  const { personal, shared } = await resolveAccountIds(config)
  const { after, before } = queryWindow()
  const props = ['title', 'start', 'utcStart', 'duration', 'showWithoutTime']
  const call = (accountId: string, q: string, g: string) => [
    ['CalendarEvent/query', { accountId, filter: { after, before }, limit: 50 }, q],
    ['CalendarEvent/get', { accountId, '#ids': { resultOf: q, name: 'CalendarEvent/query', path: '/ids' }, properties: props }, g]
  ]

  const res = await fetch(`${config.proxyUrl}/jmap`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'omit',
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:calendars'],
      methodCalls: [...call(personal, 'qp', 'gp'), ...call(shared, 'qs', 'gs')]
    })
  })
  if (!res.ok) throw new Error(`JMAP calendar query failed: ${res.status}`)
  const data = await res.json()
  const responses: [string, { list?: JmapEvent[]; description?: string }, string][] = data.methodResponses || []

  const collect = (callId: string): JmapEvent[] => {
    const found = responses.find(r => r[0] === 'CalendarEvent/get' && r[2] === callId)
    if (found) return found[1].list || []
    const error = responses.find(r => r[0] === 'error' && r[2] === callId)
    if (error) throw new Error(`JMAP ${callId}: ${error[1].description || 'unknown error'}`)
    return []
  }
  const personalEvents = collect('gp').map(ev => ({ ...ev, isShared: false }))
  const sharedEvents = collect('gs').map(ev => ({ ...ev, isShared: true }))
  const all = [...personalEvents, ...sharedEvents].filter(ev => ev.start && isToday(ev))

  // Sort by effective instant: all-day events float at their local date
  // midnight (so they sort first at 00:00), timed events at their UTC
  // instant. A string compare of mixed floating/UTC shapes can interleave
  // them incorrectly.
  all.sort((a, b) => effectiveStart(a).getTime() - effectiveStart(b).getTime())

  return all.slice(0, MAX_EVENTS).map(ev => toDisplay(ev))
}

function toDisplay(ev: JmapEvent & { isShared: boolean }): CalendarDisplayEvent {
  const allDay = isAllDay(ev)
  const d = effectiveStart(ev)
  const valid = !isNaN(d.getTime())
  const timeLabel =
    allDay || !valid
      ? null
      : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  // duration PnD is end-exclusive in JMAP/ics: P4D starting 9/4 covers
  // 9/4..9/7, so the last covered day is start + days - 1. Single-day
  // durations (P1D, PT5H...) get no range label. Range labels only apply to
  // all-day events.
  let endDateLabel: string | null = null
  const days = /^P(?:(\d+)D)/.exec(ev.duration || '')
  if (allDay && days && Number(days[1]) >= 2 && valid) {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days[1]) - 1)
    endDateLabel = `${end.getMonth() + 1}/${end.getDate()}`
  }

  return {
    timeLabel,
    title: (ev.title || 'untitled').trim(),
    endDateLabel,
    isShared: ev.isShared
  }
}

export async function fetchCalendarEvents(forceRefresh = false): Promise<CalendarData | null> {
  const cached = loadCachedCalendar()

  if (!forceRefresh && cached && Date.now() - cached.lastRefresh < FIVE_MINUTES) {
    return cached
  }

  try {
    const config = await loadCalendarConfig()
    if (!config) throw new Error('calendar config missing or invalid')
    const events = await fetchTodayEvents(config)
    const result: CalendarData = { events, lastRefresh: Date.now(), dateKey: localDateKey(new Date()) }
    safeSetStorage(CALENDAR_CACHE_KEY, JSON.stringify(result))
    return result
  } catch (e) {
    console.warn('calendar fetch error:', e)
    if (cached) return { ...cached, isStale: true }
    return null
  }
}
