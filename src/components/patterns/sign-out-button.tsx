'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { clearOfflineQueue } from '@/lib/offline-queue';

/**
 * docs/13-nfr.md §4 — signing out clears Cache Storage and IndexedDB as well as
 * the session, so nothing personal is left behind on a shared device.
 */
export function SignOutButton({ label, allLabel, icon }: { label: string; allLabel: string; icon?: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut(allDevices: boolean) {
    setPending(true);
    try {
      await api('/auth/logout', { method: 'POST', body: { allDevices } });
    } finally {
      await purgeLocalData();
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" full loading={pending} onClick={() => void signOut(false)}>
        {icon}
        {label}
      </Button>
      <Button variant="ghost" full onClick={() => void signOut(true)}>
        {allLabel}
      </Button>
    </div>
  );
}

async function purgeLocalData(): Promise<void> {
  clearOfflineQueue();
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Cache Storage may be unavailable; the session is already invalid server-side.
  }
  try {
    const databases = await indexedDB.databases?.();
    for (const database of databases ?? []) {
      if (database.name) indexedDB.deleteDatabase(database.name);
    }
  } catch {
    // Same reasoning as above.
  }
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Nothing further to do.
  }
}
