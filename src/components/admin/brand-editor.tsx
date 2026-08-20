'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { checkContrast } from '@/modules/branding/contrast';
import { ALLOWED_GOOGLE_FONTS, type BrandTokens } from '@/modules/branding/schemas';
import { brandToCssVars } from '@/modules/branding/tokens';

export type BrandDraftState = {
  name: string;
  appName: string;
  kicker: string;
  logoLightUrl: string;
  logoMarkUrl: string;
  tokens: BrandTokens;
};

const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * docs/04-white-label.md §4 — the brand editor.
 *
 * The contrast report is computed on every keystroke with the same function the
 * server uses to gate publication, so the blocker is never a surprise at the
 * end.
 */
export function BrandEditor({
  brandId,
  status,
  version,
  versions,
  initial,
}: {
  brandId: string;
  status: string;
  version: number;
  versions: Array<{ version: number; createdAt: string }>;
  initial: BrandDraftState;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const contrast = useMemo(() => checkContrast(draft.tokens), [draft.tokens]);
  const previewCss = useMemo(() => brandToCssVars(draft.tokens), [draft.tokens]);

  function setColor(role: 'primary' | 'secondary' | 'neutral', step: number, value: string) {
    setDraft((current) => ({
      ...current,
      tokens: {
        ...current.tokens,
        colors: {
          ...current.tokens.colors,
          [role]: { ...current.tokens.colors[role], [step]: value },
        },
      },
    }));
  }

  function setSemantic(key: 'bg' | 'surface' | 'ink' | 'inkMuted' | 'divider' | 'success' | 'warning' | 'danger', value: string) {
    setDraft((current) => ({
      ...current,
      tokens: { ...current.tokens, colors: { ...current.tokens.colors, [key]: value } },
    }));
  }

  async function generate(role: 'primary' | 'secondary' | 'neutral') {
    const base = draft.tokens.colors[role][500];
    const ramp = await api<Record<string, string>>('/admin/brands/ramp', { method: 'POST', body: { base } });
    setDraft((current) => ({
      ...current,
      tokens: { ...current.tokens, colors: { ...current.tokens.colors, [role]: ramp as never } },
    }));
  }

  async function save() {
    setPending(true);
    try {
      await api(`/admin/brands/${brandId}`, {
        method: 'PATCH',
        body: {
          name: draft.name,
          appName: draft.appName,
          kicker: draft.kicker || null,
          logoLightUrl: draft.logoLightUrl || null,
          logoMarkUrl: draft.logoMarkUrl || null,
          tokens: draft.tokens,
        },
      });
      toast.show('Draft saved', 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    setPending(true);
    try {
      await api(`/admin/brands/${brandId}/publish`, { method: 'POST' });
      toast.show('Published — participants see it within five minutes', 'success');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && (error.error.code === 'STEP_UP_REQUIRED' || error.error.code === 'NOT_FOUND')) {
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not publish', 'error');
    } finally {
      setPending(false);
    }
  }

  async function rollback(target: number) {
    if (!window.confirm(`Roll back to version ${target}?`)) return;
    setPending(true);
    try {
      await api(`/admin/brands/${brandId}/rollback`, { method: 'POST', body: { version: target } });
      toast.show(`Rolled back to v${target}`, 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not roll back', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-lg bg-surface p-5">
          <h2 className="font-display text-lg">Identity</h2>
          <Input label="Brand name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input label="App name" value={draft.appName} onChange={(e) => setDraft({ ...draft, appName: e.target.value })} />
          <Input label="Kicker" value={draft.kicker} onChange={(e) => setDraft({ ...draft, kicker: e.target.value })} />
          <Input
            label="Logo URL"
            value={draft.logoLightUrl}
            onChange={(e) => setDraft({ ...draft, logoLightUrl: e.target.value })}
          />
          <Input
            label="Mark URL (square, used for the PWA icon)"
            value={draft.logoMarkUrl}
            onChange={(e) => setDraft({ ...draft, logoMarkUrl: e.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FontPicker
              label="Display font"
              value={draft.tokens.font.display}
              onChange={(value) =>
                setDraft({ ...draft, tokens: { ...draft.tokens, font: { ...draft.tokens.font, display: value } } })
              }
            />
            <FontPicker
              label="Body font"
              value={draft.tokens.font.body}
              onChange={(value) =>
                setDraft({ ...draft, tokens: { ...draft.tokens, font: { ...draft.tokens.font, body: value } } })
              }
            />
          </div>
        </section>

        {(['primary', 'secondary', 'neutral'] as const).map((role) => (
          <section key={role} className="rounded-lg bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg capitalize">{role}</h2>
              <Button size="sm" variant="outline" onClick={() => void generate(role)}>
                Generate ramp from 500
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {RAMP_STEPS.map((step) => (
                <label key={step} className="flex flex-col items-center gap-1 text-[10px]">
                  <input
                    type="color"
                    aria-label={`${role} ${step}`}
                    value={draft.tokens.colors[role][step]}
                    onChange={(e) => setColor(role, step, e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-sm border border-divider"
                  />
                  {step}
                </label>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-lg bg-surface p-5">
          <h2 className="font-display text-lg">Surfaces and states</h2>
          <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
            {(['bg', 'surface', 'ink', 'inkMuted', 'divider', 'success', 'warning', 'danger'] as const).map((key) => (
              <label key={key} className="flex flex-col items-center gap-1">
                <input
                  type="color"
                  aria-label={key}
                  value={draft.tokens.colors[key].slice(0, 7)}
                  onChange={(e) => setSemantic(key, e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-sm border border-divider"
                />
                {key}
              </label>
            ))}
          </div>
        </section>
      </div>

      <aside className="flex h-fit flex-col gap-4">
        <section className="rounded-lg bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Contrast</h2>
            <Badge tone={contrast.pass ? 'success' : 'danger'}>{contrast.pass ? 'AA' : 'Fails'}</Badge>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {contrast.results.map((result) => (
              <li key={result.id} className="flex items-center gap-2">
                {result.pass ? (
                  <Check size={14} aria-label="Passes" className="shrink-0 text-success" />
                ) : (
                  <X size={14} aria-label="Fails" className="shrink-0 text-danger" />
                )}
                <span className="flex-1">{result.label}</span>
                <span className="tabular-nums">{result.ratio}:1</span>
              </li>
            ))}
          </ul>
          {!contrast.pass ? (
            <p className="mt-3 text-xs font-semibold text-danger">
              Publishing is blocked until every pair passes. This is what participants have to read.
            </p>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-lg bg-surface">
          <p className="border-b border-divider px-4 py-2 text-xs font-bold uppercase tracking-[1px] text-ink-muted">
            Preview
          </p>
          {/* The preview is the same token pipeline the app uses, scoped here. */}
          <div className="p-4" style={cssVarsToStyle(previewCss)}>
            <div className="rounded-lg p-4" style={{ background: 'var(--color-bg)' }}>
              <p style={{ color: 'var(--color-ink-muted)', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
                {draft.kicker || 'KICKER'}
              </p>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-ink)' }}>
                {draft.appName}
              </p>
              <div className="mt-3 rounded-md p-3" style={{ background: 'var(--color-surface)' }}>
                <p style={{ color: 'var(--color-ink)', fontWeight: 600 }}>Gala Night</p>
                <p style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>20:00 · Main Stage</p>
              </div>
              <div className="mt-3 flex gap-2">
                <span
                  className="inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold"
                  style={{ background: 'var(--color-primary-500)', color: 'var(--color-neutral-50)' }}
                >
                  Register
                </span>
                <span
                  className="inline-flex h-10 items-center rounded-pill px-4 text-sm font-semibold"
                  style={{ background: 'var(--color-secondary-500)', color: 'var(--color-ink)' }}
                >
                  Reserve
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-2 rounded-lg bg-surface p-5">
          <p className="text-sm">
            Status: <strong>{status}</strong> · v{version}
          </p>
          <Button loading={pending} onClick={save}>
            Save draft
          </Button>
          <Button variant="secondary" loading={pending} disabled={!contrast.pass} onClick={publish}>
            Publish
          </Button>
          {versions.length > 0 ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold">History</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {versions.map((entry) => (
                  <li key={entry.version} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-muted">
                      v{entry.version} · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(new Date(entry.createdAt))}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void rollback(entry.version)}>
                      Roll back
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </aside>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void publish();
        }}
      />
    </div>
  );
}

function FontPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" htmlFor={`font-${label}`}>
        {label}
      </label>
      <select
        id={`font-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-md border border-divider bg-surface px-4"
      >
        {ALLOWED_GOOGLE_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Turns the generated declaration string into a React style object. */
function cssVarsToStyle(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const declaration of css.split(';')) {
    const [name, value] = declaration.split(':');
    if (name?.trim().startsWith('--') && value) style[name.trim()] = value.trim();
  }
  return style as React.CSSProperties;
}
