// k6 load test: many people fill in their daily checklist at the same time.
//
// Each virtual user (VU) is one fake person (lt-user-0001, 0002, ...) made by `npm run seed:loadtest`.
// A VU signs in once, then loops: open My Checklists, answer every open question with a short pause
// between taps, submit the run, then keep checking the list and summary (as a person with the app open
// would). Run it against a THROWAWAY server and database, never production. See README.md.
//
//   k6 run -e BASE_URL=http://localhost:5050 server/loadtest/checklist.k6.js
//
// Knobs (all optional, -e NAME=value): BASE_URL, PASSWORD, PEAK_USERS (default 1000), RAMP_UP
// (default 3m), HOLD (default 3m), RAMP_DOWN (default 30s), LOGIN_SPREAD seconds (default 60),
// THINK seconds between taps (default 2).
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5050'
const PASSWORD = __ENV.PASSWORD || 'LoadTest#2026'
const PEAK_USERS = Number(__ENV.PEAK_USERS || 1000)
const LOGIN_SPREAD = Number(__ENV.LOGIN_SPREAD || 60)
const THINK = Number(__ENV.THINK || 2)

export const options = {
  scenarios: {
    checklist_fillers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '3m', target: PEAK_USERS },
        { duration: __ENV.HOLD || '3m', target: PEAK_USERS },
        { duration: __ENV.RAMP_DOWN || '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Pass/fail bars: under 1% of requests may fail, and 95% must answer in under 800 ms.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    // Rate limiting is a failure here: a real person on a real phone must not be blocked.
    rate_limited: ['count==0'],
    tick_duration: ['p(95)<800'],
  },
}

const rateLimited = new Counter('rate_limited')
const serverErrors = new Counter('server_errors')
const tickDuration = new Trend('tick_duration', true)

const pad = (n) => String(n).padStart(4, '0')

// Per-VU state (each VU has its own copy of module-level variables).
let accessToken = null
let refreshToken = null
let loggedInAs = null

const note = (res) => {
  if (res.status === 429) rateLimited.add(1)
  if (res.status >= 500) serverErrors.add(1)
}

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const login = () => {
  const email = `lt-user-${pad(__VU)}@loadtest.local`
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: jsonHeaders(null),
    tags: { name: 'POST /auth/login' },
  })
  note(res)
  const ok = check(res, { 'login 200': (r) => r.status === 200 })
  if (!ok) return false
  const body = res.json()
  accessToken = body.accessToken
  refreshToken = body.refreshToken
  loggedInAs = email
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

// One authenticated call. A 401 (expired access token) refreshes once and retries, like the real client.
const api = (method, path, name, body) => {
  const send = () => http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: jsonHeaders(accessToken),
    tags: { name },
  })
  let res = send()
  if (res.status === 401 && refreshToken && refresh()) res = send()
  note(res)
  return res
}

const think = () => sleep(THINK * (0.5 + Math.random()))

export default function () {
  if (!accessToken) {
    // Spread first sign-ins over LOGIN_SPREAD seconds. Every VU here comes from one machine/IP, so a
    // true same-second stampede would hit the per-IP limit for logins, which real users (different
    // IPs) would not. Set LOGIN_SPREAD=1 to test a stampede anyway.
    sleep(Math.random() * LOGIN_SPREAD)
    if (!login()) { sleep(5); return }
  }

  const list = api('GET', '/checklist-instances/mine?limit=20', 'GET /checklist-instances/mine')
  if (!check(list, { 'list 200': (r) => r.status === 200 })) { sleep(5); return }

  const runs = list.json('data') || []
  const run = runs[0]
  if (run) {
    const open = (run.items || []).filter((item) => !item.isDone)
    for (const item of open) {
      think()
      const t = api('PATCH', `/checklist-instance-items/${item.id}`, 'PATCH /checklist-instance-items/:id', { isDone: true })
      tickDuration.add(t.timings.duration)
      check(t, { 'tick 200': (r) => r.status === 200 })
    }

    api('GET', `/checklist-instances/${run.id}`, 'GET /checklist-instances/:id')

    if (open.length && run.verificationStatus === 'NOT_SUBMITTED') {
      think()
      const s = api('PATCH', `/checklist-instances/${run.id}/submit`, 'PATCH /checklist-instances/:id/submit', {})
      check(s, { 'submit 200': (r) => r.status === 200 })
    }
  }

  api('GET', '/checklist-instances/summary', 'GET /checklist-instances/summary')
  sleep(5 + Math.random() * 10)
}

export function handleSummary(data) {
  const m = data.metrics
  const line = (label, value) => `${label.padEnd(28)}${value}`
  const ms = (metric, p) => (metric && metric.values[p] !== undefined ? `${metric.values[p].toFixed(0)} ms` : 'n/a')
  const out = [
    '',
    line('Signed-in people (peak):', PEAK_USERS),
    line('Requests:', m.http_reqs ? m.http_reqs.values.count : 0),
    line('Failed requests:', m.http_req_failed ? `${(m.http_req_failed.values.rate * 100).toFixed(2)} %` : 'n/a'),
    line('Rate limited (429):', m.rate_limited ? m.rate_limited.values.count : 0),
    line('Server errors (5xx):', m.server_errors ? m.server_errors.values.count : 0),
    line('All requests p95:', ms(m.http_req_duration, 'p(95)')),
    line('Tick p50 / p95 / p99:', `${ms(m.tick_duration, 'med')} / ${ms(m.tick_duration, 'p(95)')} / ${ms(m.tick_duration, 'p(99)')}`),
    '',
  ].join('\n')
  return { stdout: out }
}
