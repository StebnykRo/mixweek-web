import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { route } from '@/lib/http/handler';
import { clientIpFrom, subnetOf } from '@/lib/http/context';
import { rateLimit } from '@/lib/rate-limit';
import { randomToken } from '@/lib/crypto/hash';
import { AuthStartSchema } from '@/modules/auth/schemas';
import { startAuth, deviceLabelFrom } from '@/modules/auth/service';
import { bindingCookieName, secureCookies } from '@/modules/auth/session';
import { readBindingCookie } from '@/lib/http/cookies';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/start
 *
 * docs/03-auth.md §2 — always 200, always the same shape, always at least
 * 400 ms. The only observable difference between a known and an unknown
 * address is whether an email actually arrives.
 */
export const POST = route(
  {
    auth: { mode: 'public' },
    body: AuthStartSchema,
    personal: true,
  },
  async ({ body, ctx, request }) => {
    const ip = ctx.ip ?? clientIpFrom(request.headers);

    // The four limits from docs/03 §7 are applied together, before any work.
    await rateLimit('auth.start.email', body.email);
    await rateLimit('auth.start.ip.minute', ip ?? 'unknown');
    await rateLimit('auth.start.ip.hour', ip ?? 'unknown');
    await rateLimit('auth.start.subnet', subnetOf(ip));

    // Binds the login to this browser, so a link opened elsewhere still needs
    // the code typed back into the original tab.
    const jar = await cookies();
    let binding = readBindingCookie(jar) ?? null;
    if (!binding) {
      binding = randomToken(24);
      jar.set(bindingCookieName(), binding, {
        httpOnly: true,
        secure: secureCookies(),
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      });
    }

    const result = await startAuth({
      email: body.email,
      ip,
      userAgent: ctx.userAgent,
      binding,
      deviceHint: deviceLabelFrom(ctx.userAgent),
    });

    return {
      ok: true,
      brand: result.brand
        ? {
            id: result.brand.id,
            key: result.brand.key,
            appName: result.brand.appName,
            kicker: result.brand.kicker,
            logoLightUrl: result.brand.logoLightUrl,
            logoMarkUrl: result.brand.logoMarkUrl,
            tokens: result.brand.tokens,
          }
        : null,
    };
  },
);

export function GET(): NextResponse {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'n/a' } }, { status: 404 });
}
