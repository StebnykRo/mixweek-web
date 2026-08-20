'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/providers/toast-provider';

/** docs/04-white-label.md §5 — modules and integrations, switchable without a deploy. */
export function FeatureFlagsPanel({ flags }: { flags: Array<{ key: string; enabled: boolean }> }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(() => new Map(flags.map((flag) => [flag.key, flag.enabled])));

  async function toggle(key: string, enabled: boolean) {
    setState((current) => new Map(current).set(key, enabled));
    try {
      await api('/admin/feature-flags', { method: 'PATCH', body: { key, enabled, eventId: null } });
      router.refresh();
    } catch {
      setState((current) => new Map(current).set(key, !enabled));
      toast.show('Could not change the flag', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl">Feature flags</h1>
        <p className="mt-1 text-sm text-ink-muted">
          These take effect immediately, for everyone in this tenant. An event can override any of them.
        </p>
      </div>

      <section className="rounded-lg bg-surface px-5 py-1">
        {flags.map((flag) => (
          <SwitchField
            key={flag.key}
            label={flag.key}
            checked={state.get(flag.key) ?? false}
            onCheckedChange={(value) => void toggle(flag.key, value)}
            className="border-b border-divider last:border-0"
          />
        ))}
      </section>
    </div>
  );
}
