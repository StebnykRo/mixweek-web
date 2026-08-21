/**
 * Initials for an avatar, from a name or an email address.
 *
 * Its own module because both server components and client components use it:
 * once the app shell became a client component, re-exporting this from there
 * meant a server component was calling into client code, which Next refuses
 * with "Attempted to call initials() from the server".
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}
