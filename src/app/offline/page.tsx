import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

/** The shell the service worker serves when a navigation fails (docs/13 §4). */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">You are offline</h1>
      <p className="text-[15px] text-ink-muted">
        The programme, the map and Help are available from the last time you opened them. Anything you change now is
        sent as soon as you are back online.
      </p>
      <Link
        href="/events"
        className="inline-flex h-12 items-center rounded-pill bg-primary-500 px-6 font-semibold text-neutral-50"
      >
        Try again
      </Link>
    </main>
  );
}
