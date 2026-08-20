/**
 * docs/03-auth.md §3 — every provider funnels into the same pipeline, so adding
 * Google OIDC later is a new implementation of this interface plus a feature
 * flag, not a change to the model or the session code.
 */
export interface AuthProvider {
  id: 'email' | 'google' | 'saml';
  /** Whether this provider is available for the tenant (from TenantSetting). */
  isEnabledFor(tenantId: string | null): Promise<boolean>;
  /** Returns a normalised profile after a successful verification. */
  authenticate(input: unknown): Promise<AuthResult>;
}

export type AuthResult = {
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  /** Google: the hd claim. Email: the address domain. Both resolve a tenant. */
  hostedDomain?: string;
  externalAccount?: { provider: string; providerAccountId: string };
};
