import Image from 'next/image';
import { cn } from '@/lib/cn';

export type BrandLogoProps = {
  appName: string;
  kicker?: string | null;
  logoUrl?: string | null;
  markUrl?: string | null;
  size?: number;
  className?: string;
  showText?: boolean;
};

/**
 * CLAUDE.md §5.3 rule 12 — the logo and the app name always come from the
 * active brand, never from a constant. The fallback is the brand's initial on a
 * brand-coloured disc, so an unconfigured tenant still looks deliberate.
 */
export function BrandLogo({ appName, kicker, logoUrl, markUrl, size = 40, className, showText = true }: BrandLogoProps) {
  const src = logoUrl ?? markUrl;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="rounded-pill object-contain" aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center rounded-pill bg-primary-500 font-display text-neutral-50"
          style={{ width: size, height: size, fontSize: size * 0.42 }}
        >
          {appName.slice(0, 1).toUpperCase()}
        </span>
      )}
      {showText ? (
        <span className="min-w-0">
          {kicker ? <span className="block text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{kicker}</span> : null}
          <span className="block truncate font-display text-lg">{appName}</span>
        </span>
      ) : null}
    </div>
  );
}
