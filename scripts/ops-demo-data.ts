import { PrismaClient, type Track, type PlaceKind } from '@prisma/client';

/**
 * `pnpm ops:demo-data --tenant=<slug> [--reset]`
 *
 * Fills an existing tenant with three browsable events — one finished, one
 * next month, one later in the year — so that every screen has something in
 * it: programme, map with a floor plan, WinStyle merchandise, photo albums,
 * and an open registration with a real form.
 *
 * Deliberately NOT prisma/seed.ts. That one truncates the database before it
 * writes, which on an installation with real tenants and real people would
 * destroy them. This only ever adds; re-running replaces the demo events'
 * own content rather than stacking duplicates, and --reset removes only
 * these three.
 */
const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;


function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

/** Local wall-clock time on `base + dayOffset`, expressed in UTC for storage. */
function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base.getTime() + dayOffset * DAY);
  d.setUTCHours(hour - 3, minute, 0, 0); // Asia/Nicosia is UTC+3 in September
  return d;
}

type EventSpec = {
  slug: string;
  title: string;
  subtitle: string;
  /** Days from today to day one. Negative for an event that has finished. */
  offsetDays: number;
  city: string;
  venue: string;
  capacity: number | null;
  withMerch: boolean;
  withAlbums: boolean;
  coverUrl: string;
};

const EVENTS: EventSpec[] = [
  {
    slug: 'demo-mix-week',
    title: 'Demo Mix Week',
    subtitle: 'Three days in Limassol — the sample event',
    offsetDays: 30,
    city: 'Limassol',
    venue: 'Demo Beach Resort',
    capacity: 120,
    withMerch: true,
    withAlbums: false,
    coverUrl: '/demo/cover-mix-week.png',
  },
  {
    slug: 'demo-winter-summit',
    title: 'Demo Winter Summit',
    subtitle: 'A second future event, so the list is not a list of one',
    offsetDays: 120,
    city: 'Kraków',
    venue: 'Demo Conference Centre',
    capacity: null,
    withMerch: false,
    withAlbums: false,
    coverUrl: '/demo/cover-winter-summit.png',
  },
  {
    slug: 'demo-mix-week-2025',
    title: 'Demo Mix Week 2025',
    subtitle: 'Last year — photos and the aftermovie',
    offsetDays: -200,
    city: 'Limassol',
    venue: 'Demo Beach Resort',
    capacity: 90,
    withMerch: false,
    withAlbums: true,
    coverUrl: '/demo/cover-mix-week-2025.png',
  },
];

/**
 * A registration form worth showing. Without any fields the wizard is three
 * near-empty screens, which is not a fair picture of the flow.
 */
const REGISTRATION_FORM = {
  fields: [
    {
      key: 'arrival',
      type: 'date',
      required: true,
      label: { en: 'Arrival date', uk: 'Дата приїзду', ru: 'Дата приезда' },
      help: { en: 'When you land, not when the programme starts.' },
    },
    {
      key: 'tshirt',
      type: 'select',
      required: true,
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      label: { en: 'T-shirt size', uk: 'Розмір футболки', ru: 'Размер футболки' },
    },
    {
      key: 'diet',
      type: 'select',
      required: false,
      options: ['No restrictions', 'Vegetarian', 'Vegan', 'Halal', 'Gluten-free'],
      label: { en: 'Dietary preference', uk: 'Харчові вподобання', ru: 'Пищевые предпочтения' },
    },
    {
      key: 'transfer',
      type: 'boolean',
      required: false,
      label: { en: 'I need an airport transfer', uk: 'Потрібен трансфер з аеропорту', ru: 'Нужен трансфер' },
    },
    {
      key: 'notes',
      type: 'textarea',
      required: false,
      maxLength: 500,
      label: { en: 'Anything we should know?', uk: 'Що ще нам варто знати?', ru: 'Что нам стоит знать?' },
      help: { en: 'Accessibility needs, allergies, travelling with a colleague — anything.' },
    },
  ],
};

const PLACES: Array<[string, PlaceKind, string, number, number]> = [
  ['Hotel Reception', 'HOTEL', 'Check-in from 14:00. Luggage can be left from 09:00.', 15, 18],
  ['Main Stage', 'STAGE', 'Opening, closing and the all-hands sessions.', 53, 30],
  ['Workshop Room A', 'WORKSHOP', 'Small-group sessions, 25 seats.', 46, 58],
  ['Beach Club', 'RESTAURANT', 'Dinners and the evening programme.', 80, 63],
  ['Quiet Room', 'CARE', 'A room with no programme in it, on purpose.', 21, 68],
  ['Merch Desk', 'MERCH', 'Pick up anything ordered in the app.', 63, 44],
];

const PROGRAMME: Array<[number, number, number, string, Track, string, boolean, number | null]> = [
  [0, 9, 10, 'Arrival and check-in', 'LOGISTICS', 'Hotel Reception', false, null],
  [0, 11, 12, 'Opening session', 'TEAM', 'Main Stage', false, null],
  [0, 14, 16, 'Workshop: giving better feedback', 'WORKSHOP', 'Workshop Room A', true, 25],
  [0, 16, 17, 'Workshop: reading a P&L', 'WORKSHOP', 'Workshop Room A', true, 25],
  [0, 20, 23, 'Welcome dinner', 'PARTY', 'Beach Club', false, null],
  [1, 8, 9, 'Morning run', 'SPORT', 'Beach Club', true, 30],
  [1, 11, 13, 'Workshop: writing that gets read', 'WORKSHOP', 'Workshop Room A', true, 25],
  [1, 15, 17, 'Team challenge', 'TEAM', 'Main Stage', false, null],
  [1, 21, 23, 'Beach party', 'PARTY', 'Beach Club', false, null],
  [2, 10, 11, 'Closing session', 'TEAM', 'Main Stage', false, null],
  [2, 12, 14, 'Departures', 'LOGISTICS', 'Hotel Reception', false, null],
];

// PNG rather than SVG on purpose: next/image refuses SVG sources unless
// dangerouslyAllowSVG is set, and enabling that for the whole application to
// carry demo artwork is a poor trade.
const ALBUMS: Array<[string, string, string, string]> = [
  // title, cover, external link, kind
  ['Opening night', '/demo/album-opening.png', 'https://example.com/albums/opening-night', 'PHOTOGRAPHER_GALLERY'],
  ['Beach day', '/demo/album-beach.png', 'https://example.com/albums/beach-day', 'PHOTOGRAPHER_GALLERY'],
  ['Workshops', '/demo/album-workshops.png', 'https://example.com/albums/workshops', 'PARTICIPANT_UPLOAD'],
  ['Team challenge', '/demo/album-team.png', 'https://example.com/albums/team-challenge', 'PARTICIPANT_UPLOAD'],
  ['Aftermovie', '/demo/aftermovie.png', 'https://example.com/videos/aftermovie', 'AFTERMOVIE'],
];

const MERCH: Array<[string, string, string, number, string[]]> = [
  // sku, name, description, price in cents, sizes
  ['TEE', 'Event T-shirt', 'Organic cotton, unisex fit. Free for every participant.', 0, ['XS', 'S', 'M', 'L', 'XL', 'XXL']],
  ['HOODIE', 'Hoodie', 'Heavier than it looks. Runs one size large.', 0, ['S', 'M', 'L', 'XL']],
  ['BOTTLE', 'Water bottle', 'Refill points are marked on the map.', 0, ['ONE']],
  ['CAP', 'Cap', 'One size, adjustable.', 0, ['ONE']],
];

async function buildEvent(tenantId: string, spec: EventSpec): Promise<string> {
  const start = new Date(Date.now() + spec.offsetDays * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const isPast = spec.offsetDays < 0;

  const existing = await prisma.event.findFirst({
    where: { tenantId, slug: spec.slug },
    select: { id: true },
  });

  const data = {
    title: spec.title,
    subtitle: spec.subtitle,
    description:
      'Demo content created by ops:demo-data. Everything here is safe to edit or delete — it exists so the ' +
      'programme, map, merchandise and photo screens can be seen working before real content lands.',
    coverUrl: spec.coverUrl,
    startsAt: at(start, 0, 9),
    endsAt: at(start, 2, 22),
    timezone: 'Asia/Nicosia',
    city: spec.city,
    country: spec.city === 'Kraków' ? 'Poland' : 'Cyprus',
    venueName: spec.venue,
    visibility: 'TENANT' as const,
    // A finished event no longer takes registrations; the app should show the
    // past-event view rather than a form.
    registrationEnabled: !isPast,
    registrationClosesAt: isPast ? null : at(start, -2, 23, 59),
    capacity: spec.capacity,
    waitlistEnabled: !isPast,
    approvalRequired: false,
    registrationForm: isPast ? undefined : (REGISTRATION_FORM as never),
    status: 'PUBLISHED' as const,
    publishedAt: new Date(),
  };

  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data, select: { id: true, slug: true } })
    : await prisma.event.create({ data: { ...data, tenantId, slug: spec.slug }, select: { id: true, slug: true } });

  // Replace this event's own content so re-running does not stack duplicates.
  await prisma.activity.deleteMany({ where: { eventId: event.id } });
  await prisma.place.deleteMany({ where: { eventId: event.id } });
  await prisma.mediaLink.deleteMany({ where: { eventId: event.id } });
  await prisma.product.deleteMany({ where: { eventId: event.id } });

  const places: Record<string, string> = {};
  for (const [index, [name, kind, description, mapX, mapY]] of PLACES.entries()) {
    const place = await prisma.place.create({
      data: {
        tenantId,
        eventId: event.id,
        name,
        kind,
        description,
        mapX,
        mapY,
        // The map view takes its floor plan from the first place that has an
        // image, so every place carries the same one.
        imageUrl: '/demo/venue-map.png',
        sortOrder: index,
      },
      select: { id: true, name: true },
    });
    places[place.name] = place.id;
  }

  for (const [index, [day, from, to, title, track, placeName, bookingRequired, capacity]] of PROGRAMME.entries()) {
    await prisma.activity.create({
      data: {
        tenantId,
        eventId: event.id,
        title,
        description: 'Demo content — replace or delete freely.',
        track,
        startsAt: at(start, day, from),
        endsAt: at(start, day, to),
        placeId: places[placeName] ?? null,
        bookingRequired: bookingRequired && !isPast,
        capacity,
        waitlistEnabled: bookingRequired && !isPast,
        isFeatured: index === 1,
        isMandatory: track === 'TEAM',
        sortOrder: index,
        status: 'SCHEDULED',
      },
    });
  }

  if (spec.withAlbums) {
    for (const [index, [title, coverUrl, url, kind]] of ALBUMS.entries()) {
      await prisma.mediaLink.create({
        data: {
          tenantId,
          eventId: event.id,
          kind: kind as never,
          title,
          description: 'Demo album. The link goes to example.com — swap in the real one.',
          url,
          coverUrl,
          provider: 'OTHER',
          authorName: 'Demo Photographer',
          acceptsUploads: kind === 'PARTICIPANT_UPLOAD',
          itemCountHint: 40 + index * 17,
          status: 'PUBLISHED',
          sortOrder: index,
          publishedAt: new Date(),
        },
      });
    }
  }

  if (spec.withMerch) {
    for (const [index, [sku, name, description, priceCents, sizes]] of MERCH.entries()) {
      const product = await prisma.product.create({
        data: {
          tenantId,
          eventId: event.id,
          sku,
          name,
          description,
          priceCents,
          imageUrl: '/demo/album-workshops.png',
          perUserLimit: 1,
          sortOrder: index,
          isActive: true,
        },
        select: { id: true },
      });
      for (const size of sizes) {
        await prisma.productVariant.create({
          data: { tenantId, productId: product.id, size, stockTotal: 40 },
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: 'ops.demo_data',
      entityType: 'Event',
      entityId: event.id,
      diff: { slug: event.slug, albums: spec.withAlbums, merch: spec.withMerch },
    },
  });

  const bits = [`${PLACES.length} places`, `${PROGRAMME.length} sessions`];
  if (spec.withMerch) bits.push(`${MERCH.length} products`);
  if (spec.withAlbums) bits.push(`${ALBUMS.length} albums`);
  return `/events/${event.slug} — ${isPast ? 'finished' : 'upcoming'}, ${bits.join(', ')}`;
}

async function main() {
  const tenantSlug = arg('tenant')?.trim().toLowerCase();
  const reset = process.argv.includes('--reset');

  if (!tenantSlug) {
    console.error('Usage: pnpm ops:demo-data --tenant=<slug> [--reset]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
  if (!tenant) {
    console.error(`No tenant with slug "${tenantSlug}".`);
    process.exit(1);
  }

  if (reset) {
    const removed = await prisma.event.deleteMany({
      where: { tenantId: tenant.id, slug: { in: EVENTS.map((e) => e.slug) } },
    });
    console.log(`Removed ${removed.count} demo event(s) from ${tenant.slug}.`);
    return;
  }

  const built: string[] = [];
  for (const spec of EVENTS) {
    built.push(await buildEvent(tenant.id, spec));
  }

  console.log('');
  console.log(`  Demo content ready for ${tenant.slug}:`);
  for (const line of built) console.log(`    ${line}`);
  console.log('');
  console.log(`  Remove it all with:  pnpm ops:demo-data --tenant=${tenant.slug} --reset`);
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
