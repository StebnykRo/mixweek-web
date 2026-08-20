import type { cookies } from 'next/headers';
import {
  BINDING_COOKIE_NAMES,
  SESSION_COOKIE_NAMES,
  TRUSTED_DEVICE_COOKIE_NAMES,
} from '@/modules/auth/session';

type Jar = Awaited<ReturnType<typeof cookies>>;
type ReadableJar = { get(name: string): { value: string } | undefined };

function firstOf(jar: ReadableJar, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = jar.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

export const readSessionCookie = (jar: ReadableJar) => firstOf(jar, SESSION_COOKIE_NAMES);
export const readBindingCookie = (jar: ReadableJar) => firstOf(jar, BINDING_COOKIE_NAMES);
export const readTrustedDeviceCookie = (jar: ReadableJar) => firstOf(jar, TRUSTED_DEVICE_COOKIE_NAMES);

/** Clears both spellings, so signing out cannot leave a stale cookie behind. */
export function clearAuthCookies(jar: Jar, options: { allDevices?: boolean } = {}): void {
  for (const name of SESSION_COOKIE_NAMES) jar.delete(name);
  for (const name of BINDING_COOKIE_NAMES) jar.delete(name);
  if (options.allDevices) for (const name of TRUSTED_DEVICE_COOKIE_NAMES) jar.delete(name);
}
