import { PrismaClient, type Prisma } from '@prisma/client';
import { PLATFORM_DEFAULT_TOKENS, ACME_TOKENS } from '../src/modules/branding/default-brand';
import { SEED_DOMAINS } from './seed-data';

/**
 * `pnpm db:seed` — two tenants with visibly different brands, three events in
 * the three phases, a full Mix Week programme, and the user set from
 * docs/02-data-model.md §6. White-label is verifiable from the first run.
 *
 * This is one of the few places allowed to use the raw client (CLAUDE.md §5.1).
 */
const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Phases are set relative to now, so the seed is never stale (docs/06 §2). */
const now = new Date();
const liveStart = new Date(now.getTime() - 2 * DAY);
const upcomingStart = new Date(now.getTime() + 45 * DAY);
const pastStart = new Date(now.getTime() - 400 * DAY);

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  // Times are expressed in Asia/Nicosia (UTC+3 in October), stored as UTC.
  const d = new Date(base.getTime() + dayOffset * DAY);
  d.setUTCHours(hour - 3, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding…');
  await reset();

  const softswiss = await prisma.tenant.create({
    data: {
      slug: 'softswiss',
      name: 'SOFTSWISS',
      legalName: 'SOFTSWISS Group',
      defaultLocale: 'en',
      locales: ['en', 'ru', 'uk'],
      timezone: 'Asia/Nicosia',
    },
  });

  const acme = await prisma.tenant.create({
    data: {
      slug: 'acme',
      name: 'Acme Industries',
      defaultLocale: 'en',
      locales: ['en', 'uk'],
      timezone: 'Europe/Kyiv',
    },
  });

  const softswissBrand = await prisma.brand.create({
    data: {
      tenantId: softswiss.id,
      key: 'softswiss-default',
      name: 'SOFTSWISS default',
      isDefault: true,
      appName: 'Mix Week',
      kicker: 'SOFTSWISS',
      tokens: PLATFORM_DEFAULT_TOKENS as unknown as Prisma.InputJsonValue,
      status: 'PUBLISHED',
      publishedAt: now,
    },
  });

  const acmeBrand = await prisma.brand.create({
    data: {
      tenantId: acme.id,
      key: 'acme-default',
      name: 'Acme default',
      isDefault: true,
      appName: 'Acme Days',
      kicker: 'ACME',
      tokens: ACME_TOKENS as unknown as Prisma.InputJsonValue,
      status: 'PUBLISHED',
      publishedAt: now,
    },
  });

  await prisma.tenantDomain.createMany({
    data: [
      { tenantId: softswiss.id, domain: 'softswiss.com', isPrimary: true, brandId: softswissBrand.id, verifiedAt: now },
      { tenantId: softswiss.id, domain: 'softswiss.io', brandId: softswissBrand.id, verifiedAt: now },
      { tenantId: acme.id, domain: 'acme.example', isPrimary: true, brandId: acmeBrand.id, verifiedAt: now },
    ],
  });

  // ── users ──────────────────────────────────────────────────────────────
  const superAdmin = await createUser('super@platform.test', 'Platform Owner', softswiss.id, 'SUPER_ADMIN');
  const tenantAdmin = await createUser('admin@softswiss.com', 'Anna Admin', softswiss.id, 'TENANT_ADMIN', {
    department: 'People',
    jobTitle: 'Head of People',
  });
  const editor = await createUser('editor@softswiss.com', 'Eddie Editor', softswiss.id, 'CONTENT_EDITOR', {
    department: 'Marketing',
  });
  const manager = await createUser('manager@softswiss.com', 'Maya Manager', softswiss.id, 'EVENT_MANAGER', {
    department: 'People',
  });
  const hrPartner = await createUser('hr@softswiss.com', 'Hanna HR', softswiss.id, 'SUPPORT', { department: 'People' });
  await createUser('admin@acme.example', 'Alex Acme', acme.id, 'TENANT_ADMIN');

  const departments = ['Engineering', 'Marketing', 'People', 'Finance', 'Product'];
  const teams = ['Core', 'Platform', 'Growth', 'Ops'];
  const participants = [];
  for (let i = 1; i <= 50; i += 1) {
    participants.push(
      await createUser(`user${i}@softswiss.com`, `User ${i}`, softswiss.id, 'PARTICIPANT', {
        department: departments[i % departments.length],
        team: teams[i % teams.length],
        hrContactId: i % 7 === 0 ? hrPartner.id : null,
      }),
    );
  }

  await prisma.hrAssignment.createMany({
    data: departments.map((department) => ({ tenantId: softswiss.id, department, team: null, hrUserId: hrPartner.id })),
  });

  // ── the live event: Mix Week ───────────────────────────────────────────
  const mixWeek = await prisma.event.create({
    data: {
      tenantId: softswiss.id,
      slug: 'mix-week-2026',
      title: 'Mix Week 2026',
      subtitle: 'Seven days in Limassol',
      description:
        'One week, one place, everyone together. Workshops in the morning, sport in the afternoon, and Gala Night to close it out.',
      startsAt: at(liveStart, 0, 9),
      endsAt: at(liveStart, 6, 23, 59),
      timezone: 'Asia/Nicosia',
      city: 'Limassol',
      country: 'Cyprus',
      venueName: 'Parklane Resort',
      status: 'PUBLISHED',
      publishedAt: new Date(now.getTime() - 30 * DAY),
      registrationEnabled: true,
      registrationClosesAt: new Date(liveStart.getTime() - 1 * DAY),
      capacity: 400,
      waitlistEnabled: true,
      brandId: softswissBrand.id,
      registrationForm: {
        fields: [
          { key: 'arrivalDate', type: 'date', label: { en: 'Arrival date' }, required: true },
          {
            key: 'dietary',
            type: 'select',
            label: { en: 'Dietary preference' },
            help: { en: 'Used only to plan catering, deleted after the event.' },
            options: ['none', 'vegetarian', 'vegan', 'gluten-free'],
          },
          { key: 'tshirtSize', type: 'select', label: { en: 'T-shirt size' }, options: ['S', 'M', 'L', 'XL'] },
          { key: 'needsTransfer', type: 'boolean', label: { en: 'Airport transfer needed' } },
          { key: 'notes', type: 'textarea', label: { en: 'Anything we should know?' }, maxLength: 500 },
        ],
      } as Prisma.InputJsonValue,
    },
  });

  const places = await seedPlaces(softswiss.id, mixWeek.id);
  await seedProgramme(softswiss.id, mixWeek.id, liveStart, places);
  await seedContent(softswiss.id, mixWeek.id);
  await seedProducts(softswiss.id, mixWeek.id);

  await prisma.announcement.create({
    data: {
      tenantId: softswiss.id,
      eventId: mixWeek.id,
      title: 'Buses to Gala Night leave at 17:30',
      body: 'Meet in the hotel lobby. The last bus leaves at 18:00 sharp.',
      severity: 'INFO',
      isPublished: true,
      isPinned: true,
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + 2 * DAY),
      createdBy: manager.id,
    },
  });

  // Registrations: most confirmed, a handful on the waiting list.
  for (const [index, user] of participants.entries()) {
    await prisma.eventRegistration.create({
      data: {
        tenantId: softswiss.id,
        eventId: mixWeek.id,
        userId: user.id,
        status: index < 45 ? 'CONFIRMED' : 'WAITLISTED',
        waitlistPosition: index < 45 ? null : index - 44,
        answers: { arrivalDate: '2026-10-21', dietary: index % 5 === 0 ? 'vegetarian' : 'none', tshirtSize: 'M' },
      },
    });
  }
  for (const user of [tenantAdmin, editor, manager, hrPartner]) {
    await prisma.eventRegistration.create({
      data: { tenantId: softswiss.id, eventId: mixWeek.id, userId: user.id, status: 'CONFIRMED' },
    });
  }

  // ── the upcoming event ─────────────────────────────────────────────────
  const summit = await prisma.event.create({
    data: {
      tenantId: softswiss.id,
      slug: 'product-summit-2027',
      title: 'Product Summit 2027',
      subtitle: 'Two days of roadmap and craft',
      description: 'Registration is open. Places are limited.',
      startsAt: at(upcomingStart, 0, 10),
      endsAt: at(upcomingStart, 1, 18),
      timezone: 'Asia/Nicosia',
      city: 'Limassol',
      country: 'Cyprus',
      venueName: 'City Conference Hall',
      status: 'PUBLISHED',
      publishedAt: now,
      registrationEnabled: true,
      registrationOpensAt: new Date(now.getTime() - DAY),
      registrationClosesAt: new Date(upcomingStart.getTime() - 7 * DAY),
      capacity: 120,
      waitlistEnabled: true,
      approvalRequired: false,
      brandId: softswissBrand.id,
    },
  });

  await prisma.activity.createMany({
    data: [
      {
        tenantId: softswiss.id,
        eventId: summit.id,
        title: 'Opening keynote',
        track: 'WORKSHOP',
        startsAt: at(upcomingStart, 0, 10),
        endsAt: at(upcomingStart, 0, 11),
        isFeatured: true,
      },
      {
        tenantId: softswiss.id,
        eventId: summit.id,
        title: 'Roadmap workshop',
        track: 'WORKSHOP',
        startsAt: at(upcomingStart, 0, 11, 30),
        endsAt: at(upcomingStart, 0, 13),
        bookingRequired: true,
        capacity: 30,
      },
    ],
  });

  // ── the past event, with media ─────────────────────────────────────────
  const lastYear = await prisma.event.create({
    data: {
      tenantId: softswiss.id,
      slug: 'mix-week-2025',
      title: 'Mix Week 2025',
      subtitle: 'Limassol, last year',
      startsAt: at(pastStart, 0, 9),
      endsAt: at(pastStart, 5, 23),
      timezone: 'Asia/Nicosia',
      city: 'Limassol',
      country: 'Cyprus',
      status: 'ARCHIVED',
      publishedAt: new Date(pastStart.getTime() - 30 * DAY),
      archivedAt: new Date(pastStart.getTime() + 10 * DAY),
      registrationEnabled: false,
      brandId: softswissBrand.id,
    },
  });

  await prisma.mediaLink.createMany({
    data: [
      {
        tenantId: softswiss.id,
        eventId: lastYear.id,
        kind: 'PARTICIPANT_UPLOAD',
        title: 'Shared folder — everyone’s photos',
        description: 'Drop your own shots here. Please check that people in them are happy to be published.',
        url: 'https://drive.google.com/drive/folders/mixweek2025',
        coverUrl: '/media/seed/participants-cover.webp',
        provider: 'GOOGLE_DRIVE',
        acceptsUploads: true,
        accessNote: 'Corporate account required',
        itemCountHint: 1240,
        status: 'PUBLISHED',
        publishedAt: new Date(pastStart.getTime() + 12 * DAY),
        sortOrder: 0,
      },
      {
        tenantId: softswiss.id,
        eventId: lastYear.id,
        kind: 'PARTICIPANT_UPLOAD',
        title: 'Sport day — team folder',
        url: 'https://www.dropbox.com/sh/mixweek-sport',
        coverUrl: '/media/seed/sport-cover.webp',
        provider: 'DROPBOX',
        acceptsUploads: true,
        status: 'PUBLISHED',
        publishedAt: new Date(pastStart.getTime() + 12 * DAY),
        sortOrder: 1,
      },
      {
        tenantId: softswiss.id,
        eventId: lastYear.id,
        kind: 'PHOTOGRAPHER_GALLERY',
        title: 'Gala Night — official gallery',
        description: 'Full-resolution downloads, password in the email.',
        url: 'https://mixweek.pixieset.com/galanight2025',
        coverUrl: '/media/seed/gala-cover.webp',
        provider: 'PIXIESET',
        authorName: 'Studio Lumen',
        accessNote: 'Password sent by email',
        itemCountHint: 450,
        status: 'PUBLISHED',
        publishedAt: new Date(pastStart.getTime() + 14 * DAY),
        sortOrder: 2,
      },
      {
        tenantId: softswiss.id,
        eventId: lastYear.id,
        kind: 'PHOTOGRAPHER_GALLERY',
        title: 'Workshops — reportage',
        url: 'https://www.smugmug.com/mixweek/workshops',
        coverUrl: '/media/seed/workshops-cover.webp',
        provider: 'SMUGMUG',
        authorName: 'Nikos P.',
        itemCountHint: 320,
        status: 'PUBLISHED',
        publishedAt: new Date(pastStart.getTime() + 14 * DAY),
        sortOrder: 3,
      },
    ],
  });

  for (const user of participants.slice(0, 30)) {
    await prisma.eventRegistration.create({
      data: {
        tenantId: softswiss.id,
        eventId: lastYear.id,
        userId: user.id,
        status: 'ATTENDED',
        checkedInAt: at(pastStart, 0, 10),
      },
    });
  }

  // ── the second tenant, so isolation is exercised from the start ────────
  const acmeEvent = await prisma.event.create({
    data: {
      tenantId: acme.id,
      slug: 'acme-days-2026',
      title: 'Acme Days 2026',
      subtitle: 'Kyiv, two days',
      startsAt: at(upcomingStart, 10, 10),
      endsAt: at(upcomingStart, 11, 18),
      timezone: 'Europe/Kyiv',
      city: 'Kyiv',
      country: 'Ukraine',
      status: 'PUBLISHED',
      publishedAt: now,
      registrationEnabled: true,
      capacity: 80,
      brandId: acmeBrand.id,
    },
  });

  await prisma.activity.create({
    data: {
      tenantId: acme.id,
      eventId: acmeEvent.id,
      title: 'Acme opening',
      track: 'WORKSHOP',
      startsAt: at(upcomingStart, 10, 10),
      endsAt: at(upcomingStart, 10, 11),
    },
  });

  await prisma.featureFlag.createMany({
    data: [
      { key: 'auth.google', tenantId: null, enabled: false },
      { key: 'media.embed', tenantId: null, enabled: false },
      { key: 'map.google', tenantId: null, enabled: false },
      { key: 'media.self_hosted_upload', tenantId: null, enabled: false },
      { key: 'tenant.custom_host', tenantId: null, enabled: false },
      { key: 'module.winstyle', tenantId: acme.id, enabled: false },
    ],
  });

  await prisma.tenantSetting.createMany({
    data: [
      { tenantId: softswiss.id, key: 'support.email', value: 'mixweek@softswiss.com' },
      { tenantId: softswiss.id, key: 'support.phone', value: '+357 99 000 000' },
      { tenantId: softswiss.id, key: 'mail.from_name', value: 'Mix Week' },
      { tenantId: softswiss.id, key: 'mail.from_email', value: 'no-reply@softswiss.com' },
      { tenantId: acme.id, key: 'support.email', value: 'people@acme.example' },
    ],
  });

  console.log(`Done. Tenants: ${softswiss.slug}, ${acme.slug}. Seed domains: ${SEED_DOMAINS.join(', ')}`);
  console.log(`Sign in as admin@softswiss.com — the code is printed by the mail transport in development.`);
  console.log(`Super admin: ${superAdmin.email}`);
}

async function reset() {
  // Cascades handle the children; tenants and users are the two roots.
  await prisma.auditLog.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.trustedDevice.deleteMany();
  await prisma.hrAssignment.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.secretSetting.deleteMany();
  await prisma.featureFlag.deleteMany();
}

async function createUser(
  email: string,
  name: string,
  tenantId: string,
  role: 'PARTICIPANT' | 'GUEST' | 'SUPPORT' | 'CONTENT_EDITOR' | 'EVENT_MANAGER' | 'TENANT_ADMIN' | 'SUPER_ADMIN',
  extra?: { department?: string | undefined; team?: string | undefined; jobTitle?: string; hrContactId?: string | null },
) {
  const user = await prisma.user.create({
    data: {
      email,
      name,
      emailVerifiedAt: new Date(),
      primaryTenantId: tenantId,
      department: extra?.department ?? null,
      team: extra?.team ?? null,
      jobTitle: extra?.jobTitle ?? null,
      hrContactId: extra?.hrContactId ?? null,
      locale: 'en',
      status: 'ACTIVE',
    },
  });
  await prisma.membership.create({ data: { userId: user.id, tenantId, role, status: 'ACTIVE' } });
  await prisma.consent.createMany({
    data: [
      { userId: user.id, tenantId, kind: 'TERMS', documentVersion: '2026-01', granted: true },
      { userId: user.id, tenantId, kind: 'PRIVACY', documentVersion: '2026-01', granted: true },
    ],
  });
  return user;
}

async function seedPlaces(tenantId: string, eventId: string) {
  const definitions = [
    { name: 'Main Stage', kind: 'STAGE' as const, mapX: 50, mapY: 30, description: 'Keynotes and Gala Night.' },
    { name: 'Workshop Hub', kind: 'WORKSHOP' as const, mapX: 25, mapY: 45, description: 'Four rooms, all named after islands.' },
    { name: 'Care Zone', kind: 'CARE' as const, mapX: 72, mapY: 40, description: 'Quiet room, massage, first aid.' },
    { name: 'WinStyle Corner', kind: 'MERCH' as const, mapX: 60, mapY: 62, description: 'Pick up your merch here.' },
    { name: 'Parklane Hotel', kind: 'HOTEL' as const, mapX: 15, mapY: 75, description: 'Check-in from 14:00.' },
    { name: 'Beach Restaurant', kind: 'RESTAURANT' as const, mapX: 82, mapY: 70, description: 'Breakfast 07:00–10:30.' },
    { name: 'Transfer Point', kind: 'TRANSFER' as const, mapX: 40, mapY: 88, description: 'Buses to the airport and Gala Night.' },
  ];

  const places = [];
  for (const [index, definition] of definitions.entries()) {
    places.push(
      await prisma.place.create({
        data: {
          tenantId,
          eventId,
          ...definition,
          lat: 34.68 + index * 0.002,
          lng: 33.04 + index * 0.002,
          openingHours: definition.kind === 'RESTAURANT' ? '07:00–23:00' : null,
          sortOrder: index,
        },
      }),
    );
  }
  return places;
}

async function seedProgramme(
  tenantId: string,
  eventId: string,
  base: Date,
  places: Array<{ id: string; name: string }>,
) {
  const stage = places[0]!;
  const hub = places[1]!;
  const care = places[2]!;
  const beach = places[5]!;

  type Row = {
    day: number;
    from: [number, number];
    to: [number, number];
    title: string;
    track: 'WORKSHOP' | 'SPORT' | 'PARTY' | 'TEAM' | 'LOGISTICS';
    place: { id: string };
    featured?: boolean;
    booking?: { capacity: number };
    mandatory?: boolean;
  };

  const rows: Row[] = [];
  const workshopTitles = [
    'Design systems that survive contact with reality',
    'Writing that people actually read',
    'Data storytelling',
    'Interviewing without bias',
    'Incident reviews without blame',
    'Negotiation basics',
    'Public speaking clinic',
  ];
  const sportTitles = ['5×5 Football', 'Beach volleyball', 'Morning run', 'Padel tournament', 'Yoga on the terrace'];
  const teamTitles = ['Team Time', 'Cross-team lunch', 'Retro of the year', 'Coffee roulette'];

  for (let day = 0; day < 7; day += 1) {
    rows.push({
      day,
      from: [8, 0],
      to: [9, 30],
      title: 'Breakfast',
      track: 'LOGISTICS',
      place: beach,
    });

    const workshop = workshopTitles[day % workshopTitles.length]!;
    rows.push({
      day,
      from: [10, 0],
      to: [11, 30],
      title: workshop,
      track: 'WORKSHOP',
      place: hub,
      booking: { capacity: day % 3 === 0 ? 24 : 40 },
    });

    rows.push({
      day,
      from: [12, 0],
      to: [13, 0],
      title: teamTitles[day % teamTitles.length]!,
      track: 'TEAM',
      place: stage,
      mandatory: day === 0,
    });

    rows.push({
      day,
      from: [15, 0],
      to: [16, 30],
      title: sportTitles[day % sportTitles.length]!,
      track: 'SPORT',
      place: care,
      booking: day % 2 === 0 ? { capacity: 20 } : undefined,
    });

    if (day === 5) {
      rows.push({
        day,
        from: [20, 0],
        to: [23, 59],
        title: 'Gala Night',
        track: 'PARTY',
        place: stage,
        featured: true,
      });
    } else if (day % 2 === 1) {
      rows.push({ day, from: [21, 0], to: [23, 0], title: 'Beach party', track: 'PARTY', place: beach });
    }
  }

  for (const [index, row] of rows.entries()) {
    await prisma.activity.create({
      data: {
        tenantId,
        eventId,
        title: row.title,
        description:
          row.track === 'WORKSHOP'
            ? `**${row.title}**\n\nA 90-minute working session. Bring a laptop; leave with something you can use on Monday.`
            : null,
        track: row.track,
        startsAt: at(base, row.day, row.from[0], row.from[1]),
        endsAt: at(base, row.day, row.to[0], row.to[1]),
        placeId: row.place.id,
        isFeatured: row.featured ?? false,
        isMandatory: row.mandatory ?? false,
        bookingRequired: Boolean(row.booking),
        capacity: row.booking?.capacity ?? null,
        waitlistEnabled: true,
        sortOrder: index,
        speakers:
          row.track === 'WORKSHOP'
            ? ([{ name: 'Guest speaker', role: 'Facilitator' }] as unknown as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}

async function seedContent(tenantId: string, eventId: string) {
  await prisma.contentBlock.createMany({
    data: [
      {
        tenantId,
        eventId,
        section: 'EVENT_STYLE',
        key: 'gala',
        title: 'Gala Night',
        body: '**Dress code:** black tie optional.\n\nDoors open at 20:00 on the Main Stage. Buses leave the hotel from 17:30.',
        icon: 'sparkles',
        sortOrder: 0,
      },
      {
        tenantId,
        eventId,
        section: 'EVENT_STYLE',
        key: 'daytime',
        title: 'Daytime',
        body: 'Smart casual. It is Cyprus in October — bring a light jacket for the evenings.',
        icon: 'sun',
        sortOrder: 1,
      },
      {
        tenantId,
        eventId,
        section: 'EVENT_STYLE',
        key: 'sport',
        title: 'Sport',
        body: 'Trainers and something you can run in. Towels are provided at the Care Zone.',
        icon: 'activity',
        sortOrder: 2,
      },
      {
        tenantId,
        eventId,
        section: 'TRAVEL',
        key: 'airport',
        title: 'Airport and arrival',
        body: 'Fly into Larnaca (LCA) or Paphos (PFO). Transfers meet every scheduled flight.',
        icon: 'plane',
        sortOrder: 0,
      },
      {
        tenantId,
        eventId,
        section: 'TRAVEL',
        key: 'hotel',
        title: 'Hotel and check-in',
        body: 'Parklane Resort. Check-in from 14:00, check-out by 11:00. Your room is under your own name.',
        icon: 'bed',
        sortOrder: 1,
      },
      {
        tenantId,
        eventId,
        section: 'TRAVEL',
        key: 'transfers',
        title: 'Transfers',
        body: 'Shuttles run every 30 minutes between the hotel and the venue, 08:00–01:00.',
        icon: 'bus',
        sortOrder: 2,
      },
      {
        tenantId,
        eventId,
        section: 'HELP',
        key: 'general',
        title: 'Need a hand?',
        body: 'The logistics desk is in the hotel lobby, 08:00–22:00. For anything urgent, use the number below.',
        icon: 'life-buoy',
        sortOrder: 0,
      },
    ],
  });

  await prisma.checklistItem.createMany({
    data: [
      { tenantId, eventId, label: 'Passport or ID', sortOrder: 0 },
      { tenantId, eventId, label: 'Gala outfit', sortOrder: 1 },
      { tenantId, eventId, label: 'Trainers', sortOrder: 2 },
      { tenantId, eventId, label: 'Swimwear', sortOrder: 3 },
      { tenantId, eventId, label: 'Charger and adapter (Type G)', sortOrder: 4 },
      { tenantId, eventId, label: 'Sunscreen', sortOrder: 5 },
    ],
  });

  await prisma.contact.createMany({
    data: [
      {
        tenantId,
        eventId,
        kind: 'URGENT',
        name: '24/7 support line',
        phone: '+357 99 000 000',
        note: 'Any time, anything urgent.',
        isUrgent: true,
        sortOrder: 0,
      },
      { tenantId, eventId, kind: 'HR', name: 'Hanna HR', email: 'hr@softswiss.com', role: 'People partner', sortOrder: 1 },
      {
        tenantId,
        eventId,
        kind: 'PROGRAMME',
        name: 'Maya Manager',
        email: 'manager@softswiss.com',
        role: 'Programme',
        sortOrder: 2,
      },
      {
        tenantId,
        eventId,
        kind: 'LOGISTICS',
        name: 'Logistics desk',
        phone: '+357 99 000 001',
        note: 'Hotel lobby, 08:00–22:00',
        sortOrder: 3,
      },
    ],
  });
}

async function seedProducts(tenantId: string, eventId: string) {
  const catalogue = [
    { sku: 'MW-TEE', name: 'Mix Week T-shirt', priceCents: 0, sizes: ['S', 'M', 'L', 'XL'], stock: 120 },
    { sku: 'MW-HOODIE', name: 'Mix Week hoodie', priceCents: 0, sizes: ['S', 'M', 'L', 'XL'], stock: 60 },
    { sku: 'MW-BOTTLE', name: 'Insulated bottle', priceCents: 0, sizes: ['ONE'], stock: 200 },
    { sku: 'MW-CAP', name: 'Cap', priceCents: 0, sizes: ['ONE'], stock: 150 },
  ];

  for (const [index, item] of catalogue.entries()) {
    const product = await prisma.product.create({
      data: {
        tenantId,
        eventId,
        sku: item.sku,
        name: item.name,
        description: 'Free for participants. Reserve your size and collect it at the WinStyle corner.',
        priceCents: item.priceCents,
        currency: 'EUR',
        perUserLimit: 1,
        sortOrder: index,
      },
    });
    await prisma.productVariant.createMany({
      data: item.sizes.map((size) => ({
        tenantId,
        productId: product.id,
        size,
        stockTotal: Math.floor(item.stock / item.sizes.length),
      })),
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
