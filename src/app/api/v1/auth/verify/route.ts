import { cookies } from 'next/headers';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { rateLimit, progressiveDelayMs, sleep } from '@/lib/rate-limit';
import { AuthVerifySchema } from '@/modules/auth/schemas';
import { consumeCode } from '@/modules/auth/tokens';
import { completeLogin } from '@/modules/auth/service';
import { sessionCookieName, sessionCookieOptions } from '@/modules/auth/session';
import { clearAuthCookies, readBindingCookie } from '@/lib/http/cookies';
import { hasConfirmedTotp } from '@/modules/auth/totp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/verify — redeems the six-digit code.
 *
 * Five attempts per token, then it is burned (docs/03 §2). A progressive delay
 * after the third failure takes the sting out of an automated guessing run
 * without punishing someone who mistyped.
 */
export const POST = route(
  { auth: { mode: 'public' }, body: AuthVerifySchema, personal: true },
  async ({ body, ctx }) => {
    await rateLimit('auth.verify.ip', ctx.ip ?? 'unknown');

    const jar = await cookies();
    const binding = readBindingCookie(jar) ?? null;

    const outcome = await consumeCode(body.email, body.code, binding);
    if (!outcome.ok) {
      await sleep(progressiveDelayMs(outcome.reason === 'mismatch' ? 3 : 0));
      throw new AppError('VALIDATION_FAILED', 'That code did not work');
    }
    if (!outcome.bindingMatched) {
      throw new AppError('VALIDATION_FAILED', 'Enter this code in the tab where you started signing in');
    }

    const login = await completeLogin({
      email: outcome.identifier,
      metadata: outcome.metadata,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    jar.set(sessionCookieName(), login.sessionToken, sessionCookieOptions(login.expiresAt));
    for (const name of ['__Host-mw.binding', 'mw.binding']) jar.delete(name);

    return {
      ok: true,
      mfaRequired: login.mfaRequired,
      mfaEnrolled: login.mfaEnrolled || (await hasConfirmedTotp(login.userId)),
      isFirstLogin: login.isFirstLogin,
      next: login.mfaRequired ? '/login/mfa' : login.isFirstLogin ? '/onboarding' : '/events',
    };
  },
);
