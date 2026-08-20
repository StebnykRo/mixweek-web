import { getBrandForRequest } from '@/lib/brand-context';
import { BrandLogo } from '@/components/patterns/brand-logo';

/**
 * docs/07-screens.md §1 — mobile is full-bleed on the page background; from
 * `lg` it becomes two columns with a brand visual on the right.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrandForRequest();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-7 py-10 lg:px-16">
        <div className="mx-auto w-full max-w-[420px]">{children}</div>
      </div>
      <div
        aria-hidden="true"
        className="hidden bg-primary-500 lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-6"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 20%, var(--color-primary-400), var(--color-primary-700))',
        }}
      >
        <BrandLogo
          appName={brand.appName}
          kicker={brand.kicker}
          logoUrl={brand.logoLightUrl}
          markUrl={brand.logoMarkUrl}
          size={96}
          showText={false}
        />
        <p className="max-w-xs text-center font-display text-3xl text-neutral-50">{brand.appName}</p>
      </div>
    </div>
  );
}
