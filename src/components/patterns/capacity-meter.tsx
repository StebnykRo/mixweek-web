import { Progress } from '@/components/ui/progress';

export type CapacityMeterProps = {
  taken: number;
  total: number | null;
  waitlist?: number;
  labels: { capacity: string; waitlist: string };
};

/** docs/05 §3.2 — "12 of 40 places" plus the waiting list, always as text too. */
export function CapacityMeter({ taken, total, waitlist = 0, labels }: CapacityMeterProps) {
  if (total === null) return null;
  const ratio = total > 0 ? taken / total : 0;
  const tone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'primary';
  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={Math.min(taken, total)} max={total} label={labels.capacity} tone={tone} />
      <p className="text-xs text-ink-muted">
        {labels.capacity}
        {waitlist > 0 ? ` · ${labels.waitlist}` : ''}
      </p>
    </div>
  );
}
