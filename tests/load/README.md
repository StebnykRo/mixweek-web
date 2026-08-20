# Load scenarios

docs/13-nfr.md §1 defines four mandatory scenarios. They run against **staging**,
never production, and never against a database holding real personal data.

```bash
BASE_URL=https://staging.example.com SESSION_COOKIE=... k6 run tests/load/push-storm.js
BASE_URL=... k6 run tests/load/registration-rush.js
BASE_URL=... k6 run tests/load/steady-state.js
BASE_URL=... ADMIN_COOKIE=... k6 run tests/load/admin-export.js
```

`SESSION_COOKIE` is the value of the session cookie for a seeded load-test user
(`pnpm db:seed:load` creates 3 000 of them). The scripts never sign in
themselves: `/auth/start` is deliberately rate-limited and a load test is not
the place to prove otherwise.
