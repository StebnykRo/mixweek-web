import { emailProvider } from './email';
import { googleProvider } from './google';
import type { AuthProvider } from './types';

export const providers: Record<string, AuthProvider> = {
  email: emailProvider,
  google: googleProvider,
};

export async function enabledProviders(tenantId: string | null): Promise<AuthProvider['id'][]> {
  const entries = await Promise.all(
    Object.values(providers).map(async (provider) =>
      (await provider.isEnabledFor(tenantId)) ? provider.id : null,
    ),
  );
  return entries.filter((id): id is AuthProvider['id'] => id !== null);
}

export * from './types';
