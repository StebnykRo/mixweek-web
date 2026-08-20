'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type Result = { kind: 'ok' | 'repeat' | 'error'; message: string; name?: string | null; at?: string };

type QueuedScan = { eventId: string; token?: string; offlineCode?: string; at: number };

const QUEUE_KEY = 'mw.checkin-queue';

/**
 * docs/10-admin.md §3.5 — the scanner.
 *
 * Venue Wi-Fi is unreliable, so a scan that cannot reach the server is queued
 * locally and replayed; the operator is told which state they are in rather
 * than left guessing. Manual entry covers the case where the camera is refused.
 */
export function CheckInScanner({ events }: { events: Array<{ id: string; title: string }> }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [queued, setQueued] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const submit = useCallback(
    async (payload: { token?: string; offlineCode?: string }) => {
      if (!eventId) return;
      try {
        const outcome = await api<{ status: string; userName: string | null; checkedInAt: string }>(
          `/admin/events/${eventId}/check-in`,
          { method: 'POST', body: payload },
        );
        setResult({
          kind: outcome.status === 'checked-in' ? 'ok' : 'repeat',
          message: outcome.status === 'checked-in' ? 'Checked in' : 'Already checked in',
          name: outcome.userName,
          at: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(outcome.checkedInAt),
          ),
        });
        vibrate(outcome.status === 'checked-in' ? [40] : [20, 40, 20]);
      } catch (error) {
        if (!navigator.onLine) {
          enqueue({ eventId, ...payload, at: Date.now() });
          setQueued(readQueue().length);
          setResult({ kind: 'repeat', message: 'Saved offline — will sync when back online' });
          return;
        }
        setResult({
          kind: 'error',
          message: error instanceof ApiCallError ? error.error.message : 'Could not check in',
        });
        vibrate([80, 40, 80]);
      }
    },
    [eventId],
  );

  useEffect(() => {
    setQueued(readQueue().length);
    const drain = async () => {
      const pending = readQueue();
      if (pending.length === 0) return;
      writeQueue([]);
      for (const scan of pending) {
        await api(`/admin/events/${scan.eventId}/check-in`, {
          method: 'POST',
          body: scan.token ? { token: scan.token } : { offlineCode: scan.offlineCode },
        }).catch(() => enqueue(scan));
      }
      setQueued(readQueue().length);
    };
    window.addEventListener('online', () => void drain());
    void drain();
    return () => window.removeEventListener('online', () => void drain());
  }, []);

  useEffect(() => {
    if (!scanning) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    let detector: { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null = null;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => typeof detector })
          .BarcodeDetector;
        if (!Detector) {
          setResult({ kind: 'error', message: 'This browser cannot scan QR codes — use the code field below.' });
          return;
        }
        detector = new Detector({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled || !videoRef.current || !detector) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              await submit({ token: value });
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          } catch {
            // A frame that cannot be decoded is normal; keep going.
          }
          if (!cancelled) requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setResult({ kind: 'error', message: 'Camera access was refused — use the code field below.' });
        setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, submit]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="font-display text-2xl">Check-in</h1>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="checkin-event">
          Event
        </label>
        <select
          id="checkin-event"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          className="h-12 rounded-md border border-divider bg-surface px-4"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

      {queued > 0 ? (
        <p role="status" className="rounded-md bg-warning/15 px-4 py-2 text-sm">
          {queued} scan{queued === 1 ? '' : 's'} waiting to sync.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg bg-neutral-900">
        <video ref={videoRef} muted playsInline className={cn('aspect-square w-full object-cover', !scanning && 'hidden')} />
        {!scanning ? (
          <div className="grid aspect-square place-items-center">
            <Button variant="secondary" onClick={() => setScanning(true)}>
              <Camera size={18} aria-hidden="true" />
              Start scanning
            </Button>
          </div>
        ) : null}
      </div>

      {scanning ? (
        <Button variant="quiet" onClick={() => setScanning(false)}>
          Stop
        </Button>
      ) : null}

      {result ? (
        <div
          role="status"
          aria-live="assertive"
          className={cn(
            'flex items-center gap-3 rounded-md px-4 py-3',
            result.kind === 'ok' && 'bg-success/15',
            result.kind === 'repeat' && 'bg-warning/15',
            result.kind === 'error' && 'bg-danger/15',
          )}
        >
          {result.kind === 'error' ? (
            <XCircle size={20} aria-hidden="true" className="text-danger" />
          ) : (
            <CheckCircle2 size={20} aria-hidden="true" className="text-success" />
          )}
          <div>
            <p className="font-semibold">{result.message}</p>
            {result.name ? (
              <p className="text-sm text-ink-muted">
                {result.name}
                {result.at ? ` · ${result.at}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit({ offlineCode: manual.trim().toUpperCase() });
          setManual('');
        }}
      >
        <Input
          label="Backup code"
          hint="The six-character code shown on the participant's screen when they have no signal."
          value={manual}
          onChange={(event) => setManual(event.target.value.toUpperCase())}
          maxLength={8}
        />
        <Button type="submit" variant="outline" disabled={manual.trim().length < 4}>
          Check in
        </Button>
      </form>
    </div>
  );
}

function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every device supports it, and it is a nicety either way.
  }
}

function readQueue(): QueuedScan[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedScan[];
  } catch {
    return [];
  }
}

function writeQueue(entries: QueuedScan[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-500)));
  } catch {
    // Nothing sensible to do if storage is unavailable.
  }
}

function enqueue(scan: QueuedScan): void {
  writeQueue([...readQueue(), scan]);
}
