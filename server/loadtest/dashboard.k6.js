import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'

const ENDPOINTS = [
  'POST /auth/login',
  'POST /auth/refresh',
  'GET /dashboard/summaries',
  'GET /checklist-instances/mine/focus',
  'GET /tasks (home)',
  'GET /tickets (home)',
  'GET /notifications',
  'GET /exceptions',
  'GET /exceptions/people',
  'GET /exceptions/action-points',
  'GET /scores/explorer',
  'GET /scores/org-counts',
  'GET /tasks/pending-approval',
  'GET /tickets/pending-approval',
  'GET /checklist-instances/pending-approval-preview',
]

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5050'
const PASSWORD = __ENV.PASSWORD || 'LoadTest#2026'
const PEAK_USERS = Number(__ENV.PEAK_USERS || 1000)
const LOGIN_SPREAD = Number(__ENV.LOGIN_SPREAD || 60)
const OVERSIGHT_EMAIL = __ENV.OVERSIGHT_EMAIL || ''
const OVERSIGHT_PASSWORD = __ENV.OVERSIGHT_PASSWORD || ''
const OVERSIGHT_USERS = Number(__ENV.OVERSIGHT_USERS || 5)
const REFRESH_EVERY = Number(__ENV.REFRESH_EVERY || 45)

const scenarios = {
  home_openers: {
    executor: 'ramping-vus',
    exec: 'home',
    startVUs: 0,
    stages: [
      { duration: __ENV.RAMP_UP || '3m', target: PEAK_USERS },
      { duration: __ENV.HOLD || '4m', target: PEAK_USERS },
      { duration: __ENV.RAMP_DOWN || '30s', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
}

if (OVERSIGHT_EMAIL && OVERSIGHT_PASSWORD) {
  scenarios.oversight = {
    executor: 'constant-vus',
    exec: 'oversight',
    vus: OVERSIGHT_USERS,
    duration: __ENV.OVERSIGHT_DURATION || '7m',
  }
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    rate_limited: ['count==0'],
    server_errors: ['count==0'],
    ...Object.fromEntries(ENDPOINTS.map((name) => [`http_req_duration{name:${name}}`, ['max>=0']])),
  },
}

const rateLimited = new Counter('rate_limited')
const serverErrors = new Counter('server_errors')

const pad = (n) => String(n).padStart(4, '0')

let accessToken = null
let refreshToken = null

const note = (res) => {
  if (res.status === 429) rateLimited.add(1)
  if (res.status >= 500) serverErrors.add(1)
}

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const signIn = (email, password) => {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: jsonHeaders(null),
    tags: { name: 'POST /auth/login' },
  })
  note(res)
  if (!check(res, { 'login 200': (r) => r.status === 200 })) return false
  const body = res.json()
  if (!body.accessToken) return false
  accessToken = body.accessToken
  refreshToken = body.refreshToken
  return true
}

const refresh = () => {
  const res = http.post(`${BASE_URL}/auth/refresh`, JSON.stringify({ refreshToken }), {
    headers: jsonHeaders(null),
    tags: { name: 'POST /auth/refresh' },
  })
  note(res)
  if (res.status !== 200) return false
  const body = res.json()
  accessToken = body.accessToken
  refreshToken = body.refreshToken || refreshToken
  return true
}

const get = (path, name) => {
  const send = () => http.get(`${BASE_URL}${path}`, { headers: jsonHeaders(accessToken), tags: { name } })
  let res = send()
  if (res.status === 401 && refreshToken && refresh()) res = send()
  note(res)
  check(res, { [`${name} 200`]: (r) => r.status === 200 })
  return res
}

const todayIso = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}
const dayKey = (date) => date.toISOString().slice(0, 10)

const openHome = (scope) => {
  get(`/dashboard/summaries?scope=${scope}&today=${encodeURIComponent(todayIso())}`, 'GET /dashboard/summaries')
  get('/checklist-instances/mine/focus', 'GET /checklist-instances/mine/focus')
  get('/tasks?checklistSummary=1&page=1&limit=200', 'GET /tasks (home)')
  get('/tickets?page=1&limit=250', 'GET /tickets (home)')
  get('/notifications', 'GET /notifications')
}

const poll = (scope) => {
  get(`/dashboard/summaries?scope=${scope}&today=${encodeURIComponent(todayIso())}`, 'GET /dashboard/summaries')
  get('/checklist-instances/mine/focus', 'GET /checklist-instances/mine/focus')
  get('/notifications', 'GET /notifications')
}

export function home() {
  if (!accessToken) {
    sleep(Math.random() * LOGIN_SPREAD)
    if (!signIn(`lt-user-${pad(__VU)}@loadtest.local`, PASSWORD)) { sleep(5); return }
    openHome('mine')
  }
  sleep(REFRESH_EVERY * (0.7 + Math.random() * 0.6))
  poll('mine')
}

export function oversight() {
  if (!accessToken) {
    if (!signIn(OVERSIGHT_EMAIL, OVERSIGHT_PASSWORD)) { sleep(5); return }
  }
  const today = new Date()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  get(`/dashboard/summaries?scope=visible&today=${encodeURIComponent(todayIso())}`, 'GET /dashboard/summaries')
  get('/exceptions', 'GET /exceptions')
  get('/exceptions/people', 'GET /exceptions/people')
  get('/exceptions/action-points', 'GET /exceptions/action-points')
  get('/tasks/pending-approval', 'GET /tasks/pending-approval')
  get('/tickets/pending-approval', 'GET /tickets/pending-approval')
  get('/checklist-instances/pending-approval-preview', 'GET /checklist-instances/pending-approval-preview')
  get('/scores/org-counts', 'GET /scores/org-counts')
  get(`/scores/explorer?from=${dayKey(monthStart)}&to=${dayKey(today)}&view=department`, 'GET /scores/explorer')
  sleep(20 + Math.random() * 20)
}

export function handleSummary(data) {
  const m = data.metrics
  const line = (label, value) => `${label.padEnd(28)}${value}`
  const ms = (metric, p) => (metric && metric.values[p] !== undefined ? `${metric.values[p].toFixed(0)} ms` : 'n/a')
  const out = [
    '',
    line('People on Home (peak):', PEAK_USERS),
    line('PC or Admin accounts:', OVERSIGHT_EMAIL ? OVERSIGHT_USERS : 'not used'),
    line('Requests:', m.http_reqs ? m.http_reqs.values.count : 0),
    line('Failed requests:', m.http_req_failed ? `${(m.http_req_failed.values.rate * 100).toFixed(2)} %` : 'n/a'),
    line('Rate limited (429):', m.rate_limited ? m.rate_limited.values.count : 0),
    line('Server errors (5xx):', m.server_errors ? m.server_errors.values.count : 0),
    line('All requests p95:', ms(m.http_req_duration, 'p(95)')),
    '',
    'Per endpoint (p50 / p95 / max):',
    ...ENDPOINTS.map((name) => {
      const metric = m[`http_req_duration{name:${name}}`]
      return metric ? `  ${name.padEnd(50)}${ms(metric, 'med')} / ${ms(metric, 'p(95)')} / ${ms(metric, 'max')}` : `  ${name.padEnd(50)}no requests`
    }),
    '',
  ].join('\n')
  return { stdout: out }
}
