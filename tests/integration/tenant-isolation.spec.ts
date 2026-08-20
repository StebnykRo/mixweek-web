import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_SCOPED_MODELS, NULLABLE_TENANT_MODELS } from '@/lib/db/models';
import { withTenant, MissingTenantScopeError, UnsafeUniqueLookupError } from '@/lib/db/tenant-client';
import { prisma } from '@/lib/db/client';
import { adminDb, asAppUser, createTenantFixture, resetDatabase, type TenantFixture } from '../fixtures';

/**
 * docs/14-qa.md §2.1 — the tenant isolation suite.
 *
 * The entity list is imported from the same module the guard and the RLS
 * migration are generated from, so the three cannot drift apart.
 */

let tenantA: TenantFixture;
let tenantB: TenantFixture;

beforeAll(async () => {
  await resetDatabase();
  tenantA = await createTenantFixture({ slug: 'isoa' });
  tenantB = await createTenantFixture({ slug: 'isob' });
});

afterAll(async () => {
  await resetDatabase();
  await adminDb.$disconnect();
  await prisma.$disconnect();
});

describe('the Prisma guard', () => {
  it('refuses a scoped query with no tenant at all', async () => {
    await expect(withTenant('', async () => undefined)).rejects.toThrow(MissingTenantScopeError);
  });

  it('cannot read another tenant event, even by its exact id', async () => {
    const found = await withTenant(tenantA.tenantId, (db) =>
      db.event.findFirst({ where: { id: tenantB.eventId } }),
    );
    expect(found).toBeNull();
  });

  it('cannot read another tenant activity by its exact id', async () => {
    const found = await withTenant(tenantA.tenantId, (db) =>
      db.activity.findFirst({ where: { id: tenantB.activityId } }),
    );
    expect(found).toBeNull();
  });

  it('cannot update another tenant record', async () => {
    const result = await withTenant(tenantA.tenantId, (db) =>
      db.event.updateMany({ where: { id: tenantB.eventId }, data: { title: 'hijacked' } }),
    );
    expect(result.count).toBe(0);

    const untouched = await adminDb.event.findUnique({ where: { id: tenantB.eventId } });
    expect(untouched?.title).not.toBe('hijacked');
  });

  it('cannot delete another tenant record', async () => {
    const result = await withTenant(tenantA.tenantId, (db) =>
      db.activity.deleteMany({ where: { id: tenantB.activityId } }),
    );
    expect(result.count).toBe(0);
    expect(await adminDb.activity.findUnique({ where: { id: tenantB.activityId } })).not.toBeNull();
  });

  it('stamps the session tenant on a create, ignoring any tenantId supplied', async () => {
    const created = await withTenant(tenantA.tenantId, (db) =>
      // The caller passes tenant B; the guard must overwrite it with tenant A.
      db.place.create({
        data: { tenantId: tenantB.tenantId, eventId: tenantA.eventId, name: 'Stage', kind: 'STAGE' },
        select: { id: true },
      }),
    );
    const row = await adminDb.place.findUnique({ where: { id: created.id } });
    expect(row?.tenantId).toBe(tenantA.tenantId);
  });

  it('only counts its own rows', async () => {
    const countA = await withTenant(tenantA.tenantId, (db) => db.event.count());
    const countB = await withTenant(tenantB.tenantId, (db) => db.event.count());
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('refuses findUnique on a model that also holds platform rows', async () => {
    await expect(
      withTenant(tenantA.tenantId, (db) => db.featureFlag.findUnique({ where: { id: 'anything' } })),
    ).rejects.toThrow(UnsafeUniqueLookupError);
  });

  it('lets platform-level rows through for the three nullable models', async () => {
    const key = `platform.only.${Date.now()}`;
    await adminDb.featureFlag.create({ data: { key, tenantId: null, enabled: true } });
    try {
      const flags = await withTenant(tenantA.tenantId, (db) => db.featureFlag.findMany({ where: { key } }));
      expect(flags).toHaveLength(1);
      expect(NULLABLE_TENANT_MODELS.has('FeatureFlag')).toBe(true);
    } finally {
      await adminDb.featureFlag.deleteMany({ where: { key } });
    }
  });
});

describe('row level security, independent of the ORM', () => {
  it('returns nothing when no tenant scope is set', async () => {
    const rows = await asAppUser(null, (db) => db.event.findMany());
    expect(rows).toHaveLength(0);
  });

  it('returns only the scoped tenant rows even without the guard', async () => {
    const rows = await asAppUser(tenantA.tenantId, (db) => db.event.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA.tenantId);
  });

  it('hides another tenant row from a direct raw query', async () => {
    const rows = await asAppUser(tenantA.tenantId, (db) =>
      db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Event" WHERE id = ${tenantB.eventId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it('refuses to insert a row for another tenant', async () => {
    await expect(
      asAppUser(tenantA.tenantId, (db) =>
        db.$executeRaw`INSERT INTO "Place" (id, "tenantId", "eventId", name, kind) VALUES ('x1', ${tenantB.tenantId}, ${tenantB.eventId}, 'x', 'STAGE')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('has a policy on every model in the canonical list', async () => {
    const policies = await adminDb.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
    `;
    const covered = new Set(policies.map((row) => row.tablename));
    for (const model of TENANT_SCOPED_MODELS) {
      expect(covered.has(model), `${model} has no RLS policy`).toBe(true);
    }
  });

  it('forces RLS even for the table owner path', async () => {
    const rows = await adminDb.$queryRaw<Array<{ relname: string; relforcerowsecurity: boolean }>>`
      SELECT relname, relforcerowsecurity FROM pg_class
      WHERE relname = ANY(${TENANT_SCOPED_MODELS as unknown as string[]}) AND relkind = 'r'
    `;
    for (const row of rows) expect(row.relforcerowsecurity, `${row.relname} is not FORCE`).toBe(true);
  });

  it('keeps the audit log append-only for the runtime role', async () => {
    const grants = await adminDb.$queryRaw<Array<{ privilege_type: string }>>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'app_user' AND table_name = 'AuditLog'
    `;
    const kinds = grants.map((grant) => grant.privilege_type);
    expect(kinds).toContain('INSERT');
    expect(kinds).toContain('SELECT');
    expect(kinds).not.toContain('UPDATE');
    expect(kinds).not.toContain('DELETE');
  });
});
