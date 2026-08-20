'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/providers/toast-provider';

export function SettingsPanel({
  settings,
  defaults,
}: {
  settings: Record<string, string | number | boolean>;
  defaults: Record<string, string | number | boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(settings);

  async function save(key: string, value: string | number | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    try {
      await api('/admin/settings', { method: 'PUT', body: { key, value } });
      router.refresh();
    } catch {
      setValues((current) => ({ ...current, [key]: settings[key] as string | number | boolean }));
      toast.show('Could not save', 'error');
    }
  }

  const groups = {
    Modules: Object.keys(defaults).filter((key) => key.startsWith('module.')),
    Authentication: Object.keys(defaults).filter((key) => key.startsWith('auth.')),
    Branding: Object.keys(defaults).filter((key) => key.startsWith('brand.')),
    Mail: Object.keys(defaults).filter((key) => key.startsWith('mail.')),
    Support: Object.keys(defaults).filter((key) => key.startsWith('support.')),
    Legal: Object.keys(defaults).filter((key) => key.startsWith('legal.')),
    Other: Object.keys(defaults).filter(
      (key) => !/^(module|auth|brand|mail|support|legal)\./.test(key),
    ),
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl">Settings</h1>

      {Object.entries(groups).map(([group, keys]) =>
        keys.length === 0 ? null : (
          <section key={group} className="rounded-lg bg-surface px-5 py-2">
            <h2 className="py-3 font-display text-lg">{group}</h2>
            {keys.map((key) => {
              const value = values[key];
              if (typeof value === 'boolean') {
                return (
                  <SwitchField
                    key={key}
                    label={key}
                    checked={value}
                    onCheckedChange={(next) => void save(key, next)}
                    className="border-t border-divider"
                  />
                );
              }
              return (
                <div key={key} className="border-t border-divider py-3">
                  <Input
                    label={key}
                    value={String(value ?? '')}
                    onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                    onBlur={(event) =>
                      void save(key, typeof defaults[key] === 'number' ? Number(event.target.value) : event.target.value)
                    }
                  />
                </div>
              );
            })}
          </section>
        ),
      )}
    </div>
  );
}
