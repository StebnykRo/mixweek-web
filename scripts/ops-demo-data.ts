import { PrismaClient, type Track, type PlaceKind } from '@prisma/client';

/**
 * `pnpm ops:demo-data --tenant=<slug> [--reset]`
 *
 * Fills an existing tenant with a browsable event: places, a three-day
 * programme, and an open registration.
 *
 * Deliberately NOT prisma/seed.ts. That one truncates the database before it
 * writes, which on an installation with real tenants and real people would
 * destroy them. This only ever adds, and re-running updates the same event
 * instead of duplicating it. --reset removes just this demo event.
 */
const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const DEMO_SLUG = 'demo-mix-week';

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

/** Local wall-clock time on `base + dayOffset`, expressed in UTC for storage. */
function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base.getTime() + dayOffset * DAY);
  d.setUTCHours(hour - 3, minute, 0, 0); // Asia/Nicosia is UTC+3 in September
  return d;
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

  const existing = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: DEMO_SLUG },
    select: { id: true },
  });

  if (reset) {
    if (existing) {
      await prisma.event.delete({ where: { id: existing.id } });
      console.log(`Removed the demo event from ${tenant.slug}.`);
    } else {
      console.log('Nothing to remove.');
    }
    return;
  }

  const start = new Date(Date.now() + 30 * DAY);
  start.setUTCHours(0, 0, 0, 0);

  const eventData = {
    title: 'Demo Mix Week',
    subtitle: 'A sample event so every screen has something to show',
    description:
      'This is demo content created by ops:demo-data. Everything here is safe to edit or delete — ' +
      'it exists so the programme, map and registration screens can be seen working before real content lands.',
    startsAt: at(start, 0, 9),
    endsAt: at(start, 2, 22),
    timezone: 'Asia/Nicosia',
    city: 'Limassol',
    country: 'Cyprus',
    venueName: 'Demo Beach Resort',
    visibility: 'TENANT' as const,
    registrationEnabled: true,
    registrationClosesAt: at(start, -2, 23, 59),
    capacity: 120,
    waitlistEnabled: true,
    approvalRequired: false,
    status: 'PUBLISHED' as const,
    publishedAt: new Date(),
  };

  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: eventData, select: { id: true, slug: true } })
    : await prisma.event.create({
        data: { ...eventData, tenantId: tenant.id, slug: DEMO_SLUG },
        select: { id: true, slug: true },
      });

  // Re-running replaces the programme rather than stacking a second copy on
  // top of the first.
  await prisma.activity.deleteMany({ where: { eventId: event.id } });
  await prisma.place.deleteMany({ where: { eventId: event.id } });

  const placeSpec: Array<[string, PlaceKind, string, number, number]> = [
    ['Main Stage', 'STAGE', 'Opening, closing and the all-hands sessions.', 30, 40],
    ['Workshop Room A', 'WORKSHOP', 'Small-group sessions, 25 seats.', 55, 30],
    ['Beach Club', 'RESTAURANT', 'Evening programme and dinners.', 70, 65],
    ['Quiet Room', 'CARE', 'A room with no programme in it, on purpose.', 20, 70],
    ['Merch Desk', 'MERCH', 'Pick up anything ordered in the app.', 45, 55],
    ['Hotel Reception', 'HOTEL', 'Check-in from 14:00.', 10, 20],
  ];

  const places: Record<string, string> = {};
  for (const [index, [name, kind, description, mapX, mapY]] of placeSpec.entries()) {
    const place = await prisma.place.create({
      data: { tenantId: tenant.id, eventId: event.id, name, kind, description, mapX, mapY, sortOrder: index },
      select: { id: true, name: true },
    });
    places[place.name] = place.id;
  }

  const programme: Array<[number, number, number, string, Track, string, boolean, number | null]> = [
    // day, startHour, endHour, title, track, place, bookingRequired, capacity
    [0, 9, 10, 'Arrival and check-in', 'LOGISTICS', 'Hotel Reception', false, null],
    [0, 11, 12, 'Opening session', 'TEAM', 'Main Stage', false, null],
    [0, 14, 16, 'Workshop: giving better feedback', 'WORKSHOP', 'Workshop Room A', true, 25],
    [0, 20, 23, 'Welcome dinner', 'PARTY', 'Beach Club', false, null],
    [1, 9, 10, 'Morning run', 'SPORT', 'Beach Club', true, 30],
    [1, 11, 13, 'Workshop: writing that gets read', 'WORKSHOP', 'Workshop Room A', true, 25],
    [1, 15, 17, 'Team challenge', 'TEAM', 'Main Stage', false, null],
    [1, 21, 23, 'Beach party', 'PARTY', 'Beach Club', false, null],
    [2, 10, 11, 'Closing session', 'TEAM', 'Main Stage', false, null],
    [2, 12, 14, 'Departures', 'LOGISTICS', 'Hotel Reception', false, null],
  ];

  for (const [index, [day, from, to, title, track, placeName, bookingRequired, capacity]] of programme.entries()) {
    await prisma.activity.create({
      data: {
        tenantId: tenant.id,
        eventId: event.id,
        title,
        description: 'Demo content — replace or delete freely.',
        track,
        startsAt: at(start, day, from),
        endsAt: at(start, day, to),
        placeId: places[placeName] ?? null,
        bookingRequired,
        capacity,
        waitlistEnabled: bookingRequired,
        isFeatured: index === 1,
        isMandatory: track === 'TEAM',
        sortOrder: index,
        status: 'SCHEDULED',
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: 'ops.demo_data',
      entityType: 'Event',
      entityId: event.id,
      diff: { slug: event.slug, activities: programme.length, places: placeSpec.length },
    },
  });

  console.log('');
  console.log(`  Demo event ready for ${tenant.slug}.`);
  console.log(`    /events/${event.slug}`);
  console.log(`    ${placeSpec.length} places, ${programme.length} sessions, registration open, capacity 120`);
  console.log(`    Starts ${eventData.startsAt.toISOString().slice(0, 10)}`);
  console.log('');
  console.log(`  Remove it later with:  pnpm ops:demo-data --tenant=${tenant.slug} --reset`);
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
