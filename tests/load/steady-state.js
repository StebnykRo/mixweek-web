import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * docs/13-nfr.md §1 — scenario 3, "steady state".
 * 300 people, ten minutes, a realistic mix of reading and small writes.
 */

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: 300,
      duration: '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EVENT_SLUG = __ENV.EVENT_SLUG || 'mix-week-2026';
const COOKIE = __ENV.SESSION_COOKIE || '';

const params = { headers: { cookie: `mw.session=${COOKIE}`, accept: 'application/json' } };

export default function () {
  const roll = Math.random();

  if (roll < 0.45) {
    const response = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/activities`, params);
    check(response, { programme: (r) => r.status === 200 });
  } else if (roll < 0.7) {
    const response = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}`, params);
    check(response, { home: (r) => r.status === 200 });
  } else if (roll < 0.85) {
    const response = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/places`, params);
    check(response, { map: (r) => r.status === 200 });
  } else if (roll < 0.95) {
    const response = http.get(`${BASE_URL}/api/v1/me/notifications`, params);
    check(response, { notifications: (r) => r.status === 200 });
  } else {
    const response = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/my-schedule`, params);
    check(response, { schedule: (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 4);
}
