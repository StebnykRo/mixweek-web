'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';

export type SecretRow = {
  key: string;
  hint: string | null;
  keyVersion: number;
  rotatedAt: string | null;
  expiresAt: string | null;
  expiringSoon: boolean;
};

export function SecretsPanel({ items, knownKeys }: { items: SecretRow[]; knownKeys: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const configured = new Map(items.map((item) => [item.key, item]));

  async function save() {
    if (!editing) return;
    setPending(true);
    try {
      await api('/admin/secrets', { method: 'PUT', body: { key: editing, value } });
      toast.show('Saved', 'success');
      setEditing(null);
      setValue('');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && (error.error.code === 'STEP_UP_REQUIRED' || error.error.code === 'NOT_FOUND')) {
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl">Secrets</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Values are encrypted in the database and are never shown again — not here, not through the API. If a value is
          lost, set a new one.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {knownKeys.map((key) => {
          const secret = configured.get(key);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{key}</p>
                <p className="text-xs text-ink-muted">
                  {secret ? (
                    <>
                      {secret.hint} · v{secret.keyVersion}
                      {secret.rotatedAt
                        ? ` · rotated ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(new Date(secret.rotatedAt))}`
                        : ''}
                    </>
                  ) : (
                    'not set'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {secret?.expiringSoon ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                    <AlertTriangle size={14} aria-hidden="true" />
                    expires soon
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(key);
                    setValue('');
                  }}
                >
                  {secret ? 'Rotate' : 'Set'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent title={editing ?? ''} description="Paste the new value. It is encrypted before it is stored.">
          <Input
            label="Value"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button className="mt-4" full loading={pending} disabled={value.length === 0} onClick={save}>
            Save
          </Button>
        </SheetContent>
      </Sheet>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void save();
        }}
      />
    </div>
  );
}
