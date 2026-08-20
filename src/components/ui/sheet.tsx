'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * docs/05-design-system.md §2 — bottom sheet on mobile, centred dialog from
 * `lg` up. Radix handles the focus trap and returns focus to the trigger.
 */
export function Sheet({ children, ...props }: Dialog.DialogProps) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>;
}

export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  children,
  title,
  description,
  className,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/40 data-[state=open]:animate-in" />
      <Dialog.Content
        className={cn(
          'fixed z-50 flex flex-col bg-surface shadow-lg outline-none',
          'inset-x-0 bottom-0 max-h-[88vh] rounded-t-lg pb-[env(safe-area-inset-bottom)]',
          'lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:max-w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-lg lg:pb-0',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
          <div>
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-ink-muted">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <Dialog.Close
            className="grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-neutral-200"
            aria-label="Close"
          >
            <X size={20} aria-hidden="true" />
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
