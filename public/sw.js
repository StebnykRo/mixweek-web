/*
 * Service worker — docs/13-nfr.md §4.
 *
 * What is cached: the app shell, brand assets, and the read-only content a
 * participant needs when the venue Wi-Fi gives up — programme, map, EventStyle,
 * Travel, Help, announcements.
 *
 * What is never cached: /auth/*, /admin/*, /analytics/*, the short-lived QR
 * tokens, and any response marked no-store. Personal data lives in IndexedDB
 * under the current user's key, never in Cache Storage, so a shared device does
 * not leak one person's schedule to the next.
 */

const VERSION = 'mw-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const CONTENT_CACHE = `${VERSION}-content`;
const CONTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** docs/13 §4 — the closed allowlist of personal endpoints we may keep offline. */
const SW_PERSONAL_ALLOWLIST = [
  '/api/v1/events/:slug/my-schedule',
  '/api/v1/events/:slug/registrations/me',
  '/api/v1/events/:slug/orders/me',
  '/api/v1/events/:slug/checklist',
  '/api/v1/me/notifications',
];

const NEVER_CACHE = [/^\/api\/v1\/auth\//, /^\/admin\//, /^\/api\/v1\/admin\//, /^\/api\/v1\/analytics\//, /check-in-token/, /pickup-token/];

const CACHEABLE_CONTENT = [
  /^\/api\/v1\/events\/[^/]+\/activities/,
  /^\/api\/v1\/events\/[^/]+\/places/,
  /^\/api\/v1\/events\/[^/]+\/content/,
  /^\/api\/v1\/events\/[^/]+\/contacts/,
  /^\/api\/v1\/events\/[^/]+\/announcements/,
  /^\/api\/v1\/events\/[^/]+\/media/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/offline'])).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  // The page asks before we take over, so an unsaved form is never lost.
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_ALL') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  if (CACHEABLE_CONTENT.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CONTENT_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      // Never store a response the server told us not to.
      const control = response.headers.get('cache-control') ?? '';
      if (response.ok && !control.includes('no-store')) {
        const copy = new Response(response.clone().body, response);
        copy.headers.set('x-mw-cached-at', String(Date.now()));
        await cache.put(request, copy);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    const cachedAt = Number(cached.headers.get('x-mw-cached-at') ?? '0');
    if (Date.now() - cachedAt < CONTENT_TTL_MS) {
      void network;
      return cached;
    }
  }

  const fresh = await network;
  return fresh ?? cached ?? new Response(JSON.stringify({ error: { code: 'OFFLINE' } }), { status: 503 });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/offline')) ?? new Response('Offline', { status: 503 });
  }
}

/* ── Push (docs/11 §8) ───────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Update', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/badge.png',
      tag: payload.tag,
      renotify: false,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an open tab rather than piling up new ones.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/*
 * docs/11 §8 — without this handler subscriptions quietly die when the browser
 * rotates them, and people stop receiving anything with no visible signal.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch('/api/v1/me/push-subscriptions', { credentials: 'same-origin' });
      if (!response.ok) return;
      const { publicKey } = await response.json();

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();

      await fetch('/api/v1/me/push-subscriptions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
    })(),
  );
});

/* ── Background Sync for queued ♥ and checklist changes (docs/13 §4) ──── */

self.addEventListener('sync', (event) => {
  if (event.tag === 'mw-offline-queue') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients) client.postMessage({ type: 'DRAIN_OFFLINE_QUEUE' });
      }),
    );
  }
});

function base64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/* Exposed for the offline test in docs/14 §2.7. */
self.SW_PERSONAL_ALLOWLIST = SW_PERSONAL_ALLOWLIST;
