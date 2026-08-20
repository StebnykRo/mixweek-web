import { route } from '@/lib/http/handler';
import { listBrands } from '@/modules/admin/brands';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'brand:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({ items: await listBrands(session.tenantId as string) }),
);
