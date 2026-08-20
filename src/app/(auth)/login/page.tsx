import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { getBrandForRequest } from '@/lib/brand-context';
import { enabledProviders } from '@/modules/auth/providers';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.mfaSatisfied) redirect('/events');

  const brand = await getBrandForRequest();
  const providers = await enabledProviders(null);

  return (
    <LoginForm
      initialBrand={{
        appName: brand.appName,
        kicker: brand.kicker,
        logoMarkUrl: brand.logoMarkUrl,
      }}
      googleEnabled={providers.includes('google')}
    />
  );
}
