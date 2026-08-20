import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * docs/13-nfr.md §1 — scenario 1, "push storm".
 *
 * A notification goes out and 3 000 people open the app within a minute. This
 * is the shape of the load that matters: not a steady rate, but everyone at
 * once. Target: p95 under 1 s, zero 5xx.
 */

const errorRate = new Rate('errors');
const homeLatency = new Trend('home_latency', true);
const programmeLatency = new Trend('programme_latency', true);

export const options = {
  scenarios: {
    storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '60s', target: 3000 },
        { duration: '60s', target: 3000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<1000'],
    home_latency: ['p(95)<1000'],
    programme_latency: ['p(95)<1000'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EVENT_SLUG = __ENV.EVENT_SLUG || 'mix-week-2026';
const COOKIE = __ENV.SESSION_COOKIE || '';

const params = {
  headers: { cookie: `mw.session=${COOKIE}`, accept: 'application/json' },
  tags: { scenario: 'push-storm' },
};

export default function () {
  group('open the app from a push', () => {
    const home = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}`, params);
    homeLatency.add(home.timings.duration);
    errorRate.add(home.status >= 500);
    check(home, { 'event loads': (r) => r.status === 200 });

    // The programme is the shared, cacheable payload; the personal layer is a
    // separate, much smaller request (docs/01 §4).
    const programme = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/activities`, params);
    programmeLatency.add(programme.timings.duration);
    errorRate.add(programme.status >= 500);
    check(programme, { 'programme loads': (r) => r.status === 200 });

    const personal = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/my-schedule`, params);
    errorRate.add(personal.status >= 500);
  });

  sleep(Math.random() * 3);
}
