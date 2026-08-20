import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * docs/13-nfr.md §1 — scenario 4, "admin export".
 *
 * Exporting 3 000 registrations must not degrade what participants see. The
 * export runs in one VU while a second group keeps reading the programme; the
 * threshold is on the participant path, not on the export.
 */

const participantLatency = new Trend('participant_latency', true);

export const options = {
  scenarios: {
    exporting: { executor: 'constant-vus', vus: 1, duration: '2m', exec: 'exportRegistrations' },
    reading: { executor: 'constant-vus', vus: 100, duration: '2m', exec: 'readProgramme' },
  },
  thresholds: {
    // The participant experience is what must hold up.
    participant_latency: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EVENT_SLUG = __ENV.EVENT_SLUG || 'mix-week-2026';
const EVENT_ID = __ENV.EVENT_ID || '';
const ADMIN_COOKIE = __ENV.ADMIN_COOKIE || '';
const COOKIE = __ENV.SESSION_COOKIE || '';

export function exportRegistrations() {
  const response = http.post(`${BASE_URL}/api/v1/admin/events/${EVENT_ID}/registrations/export`, null, {
    headers: { cookie: `mw.session=${ADMIN_COOKIE}`, origin: BASE_URL },
    timeout: '120s',
  });
  check(response, { 'export succeeds': (r) => r.status === 200 });
}

export function readProgramme() {
  const response = http.get(`${BASE_URL}/api/v1/events/${EVENT_SLUG}/activities`, {
    headers: { cookie: `mw.session=${COOKIE}`, accept: 'application/json' },
  });
  participantLatency.add(response.timings.duration);
  check(response, { programme: (r) => r.status === 200 });
}
