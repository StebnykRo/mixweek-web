'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/providers/toast-provider';

export type DomainRow = {
  id: string;
  domain: string;
  hostType: 'EMAIL' | 'HOST';
  isPrimary: boolean;
  autoJoin: boolean;
  brandId: string | null;
};

export function DomainsPanel({
  domains,
  brands,
  canWrite,
}: {
  domains: DomainRow[];
  brands: Array<{ id: string; name: string }>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    domain: '',
    hostType: 'EMAIL' as 'EMAIL' | 'HOST',
    brandId: '',
    autoJoin: true,
  });

  function describe(error: unknown, fallback: string): string {
    return error instanceof ApiCallError
      ? [error.error.message, ...(error.error.details ?? []).map((d) => `${d.path || 'field'}: ${d.message}`)]
          .filter(Boolean)
          .join(' — ')
      : fallback;
  }

  async function add() {
    setPending(true);
    try {
      await api('/admin/domains', {
        method: 'POST',
        body: {
          domain: form.domain.trim().toLowerCase(),
          hostType: form.hostType,
          brandId: form.brandId || null,
          autoJoin: form.autoJoin,
          isPrimary: false,
        },
      });
      setForm({ domain: '', hostType: 'EMAIL', brandId: '', autoJoin: true });
      toast.show('Domain added', 'success');
      router.refresh();
    } catch (error) {
      toast.show(describe(error, 'Could not add the domain'), 'error');
    } finally {
      setPending(false);
    }
  }

  async function remove(row: DomainRow) {
    if (!window.confirm(`Remove ${row.domain}? People with an address there will no longer be able to sign in.`)) {
      return;
    }
    try {
      await api(`/admin/domains/${row.id}`, { method: 'DELETE' });
      toast.show(`${row.domain} removed`, 'success');
      router.refresh();
    } catch (error) {
      toast.show(describe(error, 'Could not remove the domain'), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">Domains</h1>
        <p className="text-[15px] text-ink-muted">
          An <strong>email domain</strong> decides who belongs to this tenant: anyone signing in with an address there
          reaches your events. A <strong>hostname</strong> is an address the app itself answers on.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {domains.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-4">
            <span className="font-semibold">{row.domain}</span>
            <Badge tone={row.hostType === 'EMAIL' ? 'primary' : 'neutral'}>
              {row.hostType === 'EMAIL' ? 'Email domain' : 'Hostname'}
            </Badge>
            {row.isPrimary ? <Badge tone="success">Primary</Badge> : null}
            {row.hostType === 'EMAIL' ? (
              <span className="text-xs text-ink-muted">
                {row.autoJoin ? 'Joins automatically' : 'Invitation required'}
              </span>
            ) : null}
            {row.brandId ? (
              <span className="text-xs text-ink-muted">
                Brand: {brands.find((brand) => brand.id === row.brandId)?.name ?? 'unknown'}
              </span>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                onClick={() => void remove(row)}
                className="ml-auto text-sm font-semibold text-danger underline"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {domains.length === 0 ? (
          <li className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">No domains yet.</li>
        ) : null}
      </ul>

      {canWrite ? (
        <section className="flex flex-col gap-4 rounded-lg bg-surface p-5">
          <h2 className="font-display text-lg">Add a domain</h2>
          <Input
            label="Domain"
            hint="acme.com for an email domain, events.acme.com for a hostname."
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="domain-kind">
              Kind
            </label>
            <select
              id="domain-kind"
              value={form.hostType}
              onChange={(e) => setForm({ ...form, hostType: e.target.value as 'EMAIL' | 'HOST' })}
              className="h-12 rounded-md border border-divider bg-surface px-4 text-[15px]"
            >
              <option value="EMAIL">Email domain — decides who belongs here</option>
              <option value="HOST">Hostname — an address the app answers on</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="domain-brand">
              Brand
            </label>
            <select
              id="domain-brand"
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              className="h-12 rounded-md border border-divider bg-surface px-4 text-[15px]"
            >
              <option value="">Use the tenant default</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted">
              People arriving through this domain see this brand. That is how one tenant runs two identities.
            </p>
          </div>
          {form.hostType === 'EMAIL' ? (
            <SwitchField
              label="Join automatically"
              checked={form.autoJoin}
              onCheckedChange={(next) => setForm({ ...form, autoJoin: next })}
            />
          ) : null}
          <Button full loading={pending} disabled={!form.domain.trim()} onClick={add}>
            Add domain
          </Button>
        </section>
      ) : null}
    </div>
  );
}
