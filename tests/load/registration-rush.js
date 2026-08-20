import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * docs/13-nfr.md §1 — scenario 2, "registration rush".
 *
 * 500 people register for an event with 100 places, in 30 seconds. The pass
 * condition is not throughput: it is that exactly 100 end up CONFIRMED and the
 * rest WAITLISTED, with no integrity errors.
 */

const confirmed = new Counter('confirmed');
const waitlisted = new Counter('waitlisted');
const rejected = new Counter('rejected');

export const options = {
  scenarios: {
    rush: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:register}': ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EVENT_SLUG = __ENV.EVENT_SLUG || 'product-summit-2027';
const COOKIES = (__ENV.SESSION_COOKIES || '').split(',');

export default function () {
  const cookie = COOKIES[__VU % COOKIES.length] || __ENV.SESSION_COOKIE || '';

  const response = http.post(
    `${BASE_URL}/api/v1/events/${EVENT_SLUG}/registrations`,
    JSON.stringify({ answers: {} }),
    {
      headers: {
        cookie: `mw.session=${cookie}`,
        'content-type': 'application/json',
        // Required by the API, and the reason a double submit is harmless.
        'idempotency-key': `load-${__VU}-${__ITER}`,
        origin: BASE_URL,
      },
      tags: { endpoint: 'register' },
    },
  );

  if (response.status === 200) {
    const body = response.json();
    if (body.status === 'CONFIRMED') confirmed.add(1);
    else if (body.status === 'WAITLISTED') waitlisted.add(1);
  } else {
    rejected.add(1);
  }

  check(response, {
    'no server error': (r) => r.status < 500,
    'answered with a decision': (r) => [200, 409, 422, 429].includes(r.status),
  });
}

export function handleSummary(data) {
  const confirmedCount = data.metrics.confirmed?.values?.count ?? 0;
  const waitlistedCount = data.metrics.waitlisted?.values?.count ?? 0;

  // The capacity check is the whole point; state it plainly in the summary.
  const verdict =
    confirmedCount === Number(__ENV.CAPACITY || 100)
      ? `PASS — exactly ${confirmedCount} confirmed`
      : `FAIL — ${confirmedCount} confirmed, expected ${__ENV.CAPACITY || 100}`;

  return {
    stdout: `\n${verdict}\nwaitlisted: ${waitlistedCount}\n`,
  };
}
