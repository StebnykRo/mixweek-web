#!/usr/bin/env node
/**
 * Part of `pnpm audit:security` — checks a running instance for the headers
 * required by docs/12-security.md §3. Used in CI against the preview
 * deployment and by hand before a release.
 */

const BASE_URL = process.env.CHECK_URL ?? 'http://localhost:3000';

const REQUIRED = {
  'strict-transport-security': /max-age=\d{7,}/,
  'x-content-type-options': /nosniff/,
  'x-frame-options': /DENY/,
  'referrer-policy': /strict-origin-when-cross-origin/,
  'cross-origin-opener-policy': /same-origin/,
  'cross-origin-resource-policy': /same-site/,
  'permissions-policy': /camera=\(self\)/,
};

const FORBIDDEN_IN_CSP = [
  { pattern: /script-src[^;]*'unsafe-inline'/, label: "unsafe-inline in script-src" },
  { pattern: /'unsafe-eval'/, label: 'unsafe-eval' },
];

const response = await fetch(`${BASE_URL}/login`, { redirect: 'manual' }).catch((error) => {
  console.error(`Could not reach ${BASE_URL}: ${error.message}`);
  process.exit(1);
});

let failed = false;

for (const [header, pattern] of Object.entries(REQUIRED)) {
  const value = response.headers.get(header);
  if (!value || !pattern.test(value)) {
    console.error(`✗ ${header}: ${value ?? 'missing'}`);
    failed = true;
  } else {
    console.log(`✓ ${header}`);
  }
}

const csp = response.headers.get('content-security-policy') ?? '';
if (!csp) {
  console.error('✗ content-security-policy: missing');
  failed = true;
} else {
  for (const { pattern, label } of FORBIDDEN_IN_CSP) {
    if (pattern.test(csp)) {
      console.error(`✗ content-security-policy contains ${label}`);
      failed = true;
    }
  }
  if (!/script-src[^;]*'nonce-/.test(csp)) {
    console.error('✗ content-security-policy: script-src has no nonce');
    failed = true;
  }
  if (!failed) console.log('✓ content-security-policy');
}

process.exit(failed ? 1 : 0);
