/**
 * docs/12-security.md §15 — the release checklist verifies that no user from
 * any of these domains, and no tenant with slug `acme`, exists in production.
 * Keeping the list in one exported constant is what makes that check possible.
 */
export const SEED_DOMAINS = ['platform.test', 'acme.example', 'example.test'] as const;
export const SEED_TENANT_SLUGS = ['acme'] as const;

export function isSeedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return (SEED_DOMAINS as readonly string[]).some((seed) => domain === seed || domain.endsWith(`.${seed}`));
}
