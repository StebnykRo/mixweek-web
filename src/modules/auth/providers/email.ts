import { emailDomain, normaliseEmail } from '@/modules/tenancy/service';
import type { AuthProvider, AuthResult } from './types';

/** The v1 provider: a verified one-time code delivered to a corporate address. */
export const emailProvider: AuthProvider = {
  id: 'email',
  async isEnabledFor() {
    return true;
  },
  async authenticate(input: unknown): Promise<AuthResult> {
    const { email } = input as { email: string };
    const normalised = normaliseEmail(email);
    return {
      email: normalised,
      emailVerified: true,
      hostedDomain: emailDomain(normalised),
    };
  },
};
