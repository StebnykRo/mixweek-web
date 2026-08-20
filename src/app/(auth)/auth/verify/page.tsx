import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { consumeLinkToken } from '@/modules/auth/tokens';
import { completeLogin } from '@/modules/auth/service';
import { sessionCookieName, sessionCookieOptions } from '@/modules/auth/session';
import { readBindingCookie } from '@/lib/http/cookies';
import { headers } from 'next/headers';
import { clientIpFrom } from '@/lib/http/context';
import { UnboundCodeForm } from './unbound-code-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Signing in', robots: { index: false, follow: false } };

const QuerySchema = z.object({ token: z.string().min(20).max(200) });

/**
 * GET /auth/verify?token=… — the magic link.
 *
 * docs/03-auth.md §2 — when the browser binding matches, the sign-in completes
 * here. When it does not, the link alone is never enough: the six-digit code
 * has to be entered as well, which is what stops a forwarded link from
 * admitting whoever received it.
 *
 * That code is now asked for on this page. Previously the page said "go back
 * to the tab where you started" and stopped — correct for a link that arrived
 * by email, and a dead end for one handed over directly by an operator, where
 * no such tab exists. The rule itself is unchanged and still enforced server
 * side by consumeCode().
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const parsed = QuerySchema.safeParse(await searchParams);
  if (!parsed.success) redirect('/login');

  const jar = await cookies();
  const binding = readBindingCookie(jar) ?? null;
  const outcome = await consumeLinkToken(parsed.data.token, binding);

  if (!outcome.ok) {
    return (
      <Message
        title="This link is no longer valid"
        body="Sign-in links work once and expire after ten minutes. Start again and we will send a new one."
      />
    );
  }

  if (!outcome.bindingMatched) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl">Almost there</h1>
          <p className="text-[15px] text-ink-muted">
            This link was opened on a different device from the one that asked for it, so we need the six-digit
            code as well. It was sent with the link.
          </p>
        </div>
        <UnboundCodeForm />
        <a href="/login" className="font-semibold text-primary-700 underline">
          Back to sign in
        </a>
      </div>
    );
  }

  const headerBag = await headers();
  const login = await completeLogin({
    email: outcome.identifier,
    metadata: outcome.metadata,
    ip: clientIpFrom(headerBag),
    userAgent: headerBag.get('user-agent'),
  });

  jar.set(sessionCookieName(), login.sessionToken, sessionCookieOptions(login.expiresAt));
  for (const name of ['__Host-mw.binding', 'mw.binding']) jar.delete(name);

  redirect(login.mfaRequired ? '/login/mfa' : login.isFirstLogin ? '/onboarding' : '/events');
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="text-[15px] text-ink-muted">{body}</p>
      <a href="/login" className="font-semibold text-primary-700 underline">
        Back to sign in
      </a>
    </div>
  );
}
