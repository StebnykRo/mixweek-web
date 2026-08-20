import { isFeatureEnabled } from '@/modules/tenancy/settings';
import { getSecret } from '@/lib/crypto/secrets';
import type { AuthProvider, AuthResult } from './types';

/**
 * docs/03-auth.md §3 — the Google shape is in place in v1 but switched off.
 *
 * Turning it on is: create the OAuth client, store google.client_id /
 * google.client_secret through the admin, enable the auth.google flag. No
 * migration, no model change.
 *
 * The linking rule below is the security-critical part: an automatic link to an
 * existing user is allowed only when Google asserts email_verified AND the
 * domain matches a verified TenantDomain. Anything else has to go through a
 * magic link to that same address, which defeats "register a Google account on
 * someone else's address".
 */
export const googleProvider: AuthProvider = {
  id: 'google',
  async isEnabledFor(tenantId: string | null) {
    if (!(await isFeatureEnabled('auth.google', { tenantId }))) return false;
    const [clientId, clientSecret] = await Promise.all([
      getSecret('google.client_id', { tenantId }),
      getSecret('google.client_secret', { tenantId }),
    ]);
    return Boolean(clientId && clientSecret);
  },
  async authenticate(input: unknown): Promise<AuthResult> {
    const claims = input as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
      hd?: string;
      sub?: string;
    };
    if (!claims.email || !claims.sub) {
      throw new Error('Google provider returned an incomplete profile');
    }
    return {
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: claims.name,
      avatarUrl: claims.picture,
      hostedDomain: claims.hd ?? claims.email.split('@')[1],
      externalAccount: { provider: 'google', providerAccountId: claims.sub },
    };
  },
};
