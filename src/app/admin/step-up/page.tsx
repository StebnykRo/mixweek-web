import { requireAdminSession } from '@/modules/admin/guard';
import { StepUpPrompt } from '@/components/admin/step-up-prompt';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Confirm it is you' };

/**
 * Where a lapsed step-up lands. Sensitive sections need a second factor
 * confirmed in the last fifteen minutes (docs/03 §5); this asks for it and
 * sends the person back where they were going.
 */
export default async function AdminStepUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();
  const raw = (await searchParams).next;
  const requested = Array.isArray(raw) ? raw[0] : raw;

  // Only ever back into the admin, and never to another host: an open
  // redirect on a page that follows a successful second factor would be a
  // gift to a phisher.
  const next = requested && /^\/admin(\/|$)/.test(requested) ? requested : '/admin';

  return <StepUpPrompt next={next} />;
}
