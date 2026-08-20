'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

export type MoreLink = { href: string; label: string };

/**
 * The bottom bar holds four destinations; everything else — the events list,
 * EventStyle, Travel, Photos, Help, the profile — lived only in the desktop
 * sidebar and was unreachable on a phone. There was no way back to the list of
 * events at all.
 */
export function MoreSheet({
  links,
  label,
  active,
}: {
  links: MoreLink[];
  label: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold',
          active ? 'text-primary-600' : 'text-ink-muted',
        )}
      >
        <Menu size={22} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={label}>
          <nav aria-label={label} className="flex flex-col">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[52px] items-center border-b border-divider text-[15px] font-semibold last:border-b-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
