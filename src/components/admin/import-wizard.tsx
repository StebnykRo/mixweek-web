'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';

type DryRun = {
  willCreate: number;
  willUpdate: number;
  skipped: Array<{ row: number; email: string; reason: string }>;
};

/**
 * docs/10-admin.md §3.10 — upload, dry run with a preview, then apply.
 *
 * The preview is not optional: an import that silently creates the wrong 400
 * accounts is far more expensive than one extra click.
 */
export function ImportWizard() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<DryRun | null>(null);
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  async function run(mode: 'dry-run' | 'apply') {
    setPending(true);
    try {
      const result = await api<DryRun & { mode: string }>('/admin/users/import', { method: 'POST', body: { csv, mode } });
      if (mode === 'dry-run') {
        setPreview(result);
      } else {
        toast.show(`Imported: ${result.willCreate} created, ${result.willUpdate} updated`, 'success');
        setOpen(false);
        setPreview(null);
        setCsv('');
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiCallError && (error.error.code === 'STEP_UP_REQUIRED' || error.error.code === 'NOT_FOUND')) {
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Import failed', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import from CSV
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="Import people"
          description="Columns: email, name, jobTitle, department, team, hrEmail, role, avatarUrl, locale"
        >
          <div className="flex flex-col gap-4">
            <label className="text-sm font-semibold" htmlFor="import-file">
              CSV file
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setCsv(await file.text());
                  setPreview(null);
                }
              }}
              className="text-sm"
            />

            <textarea
              aria-label="CSV contents"
              rows={6}
              value={csv}
              onChange={(event) => {
                setCsv(event.target.value);
                setPreview(null);
              }}
              placeholder="email,name,department"
              className="rounded-md border border-divider bg-surface p-3 font-mono text-xs"
            />

            {preview ? (
              <div className="rounded-md bg-bg p-4 text-sm">
                <p>
                  <strong>{preview.willCreate}</strong> will be created ·{' '}
                  <strong>{preview.willUpdate}</strong> will be updated ·{' '}
                  <strong>{preview.skipped.length}</strong> skipped
                </p>
                {preview.skipped.length > 0 ? (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-ink-muted">
                    {preview.skipped.map((entry) => (
                      <li key={`${entry.row}-${entry.email}`}>
                        Row {entry.row} — {entry.email || '(no email)'}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" loading={pending} disabled={csv.length < 10} onClick={() => void run('dry-run')}>
                Preview
              </Button>
              <Button loading={pending} disabled={!preview} onClick={() => void run('apply')}>
                Apply
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <StepUpDialog open={stepUpOpen} onOpenChange={setStepUpOpen} onConfirmed={() => setStepUpOpen(false)} />
    </>
  );
}
