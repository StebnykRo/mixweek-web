'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/providers/toast-provider';

export type ContentBlockRow = {
  id: string;
  section: string;
  key: string;
  title: string;
  body: string;
  sortOrder: number;
  isPublished: boolean;
};

const SECTIONS = ['EVENT_STYLE', 'TRAVEL', 'HELP', 'FAQ', 'RULES'] as const;

export function ContentEditor({ eventId, blocks }: { eventId: string; blocks: ContentBlockRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState({
    section: 'EVENT_STYLE' as (typeof SECTIONS)[number],
    key: '',
    title: '',
    body: '',
    sortOrder: 0,
  });
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/content`, {
        method: 'PUT',
        body: { ...draft, isPublished: true },
      });
      toast.show('Saved', 'success');
      setDraft({ ...draft, key: '', title: '', body: '' });
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  function edit(block: ContentBlockRow) {
    setDraft({
      section: block.section as (typeof SECTIONS)[number],
      key: block.key,
      title: block.title,
      body: block.body,
      sortOrder: block.sortOrder,
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-lg bg-surface p-5">
        <h2 className="font-display text-lg">{draft.key ? `Edit “${draft.key}”` : 'New block'}</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="content-section">
            Section
          </label>
          <select
            id="content-section"
            value={draft.section}
            onChange={(event) => setDraft({ ...draft, section: event.target.value as (typeof SECTIONS)[number] })}
            className="h-12 rounded-md border border-divider bg-surface px-4"
          >
            {SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Key"
          hint="Stable identifier inside the section, e.g. “gala” or “hotel”."
          value={draft.key}
          onChange={(event) => setDraft({ ...draft, key: event.target.value })}
        />
        <Input label="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="content-body">
            Body (Markdown)
          </label>
          <textarea
            id="content-body"
            rows={10}
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            className="rounded-md border border-divider bg-surface p-4 font-mono text-sm"
          />
          <p className="text-xs text-ink-muted">
            Links, bold, lists and headings are supported. Anything else is stripped when it is rendered.
          </p>
        </div>

        <Button loading={pending} disabled={!draft.key || !draft.title} onClick={save}>
          Save
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Blocks</h2>
        <ul className="flex flex-col gap-1.5">
          {blocks.map((block) => (
            <li key={block.id} className="rounded-md bg-surface px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="text-left font-semibold underline" onClick={() => edit(block)}>
                  {block.title}
                </button>
                <Badge>{block.section}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{block.body}</p>
            </li>
          ))}
        </ul>
        {blocks.length === 0 ? (
          <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">Nothing here yet.</p>
        ) : null}
      </section>
    </div>
  );
}
