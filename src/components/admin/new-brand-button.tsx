'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';
import { slugifyOrFallback } from '@/lib/slugify';

/** A second brand for the same tenant — a different look for a different event. */
export function NewBrandButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ name: '', key: '', appName: '' });

  async function submit() {
    setPending(true);
    try {
      const brand = await api<{ id: string }>('/admin/brands', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          key: form.key.trim() || slugifyOrFallback(form.name),
          appName: form.appName.trim() || form.name.trim(),
        },
      });
      setOpen(false);
      router.push(`/admin/brands/${brand.id}`);
      router.refresh();
    } catch (error) {
      const detail =
        error instanceof ApiCallError
          ? [error.error.message, ...(error.error.details ?? []).map((d) => `${d.path || 'field'}: ${d.message}`)]
              .filter(Boolean)
              .join(' — ')
          : 'Could not create the brand';
      toast.show(detail, 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New brand</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="New brand"
          description="Starts from the platform palette as a draft. Colours, logos and fonts are edited on the brand's own page, and nothing is visible until you publish it."
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Name"
              hint="How you refer to it in the admin."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="App name"
              hint="Shown to participants in the header. Leave empty to use the name."
              value={form.appName}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
            />
            <Input
              label="Key"
              hint={`Used in URLs and when mapping a domain. Leave empty to use “${slugifyOrFallback(form.name, 'xxxxxx')}”.`}
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
            <Button full loading={pending} disabled={!form.name.trim()} onClick={submit}>
              Create draft brand
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
