'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported' | 'ios-needs-install';

/**
 * docs/11-notifications.md §3 — the browser grants one prompt, so it is only
 * raised after an explicit "Turn on". On iOS web push exists only for an
 * installed PWA, so that case gets instructions instead of a dead button.
 */
export function PushOptIn() {
  const t = useTranslations('notifications');
  const toast = useToast();
  const [state, setState] = useState<PermissionState>('default');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState(isIos && !standalone ? 'ios-needs-install' : 'unsupported');
      return;
    }
    if (isIos && !standalone) {
      setState('ios-needs-install');
      return;
    }
    setState(Notification.permission as PermissionState);
  }, []);

  async function enable() {
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PermissionState);
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>('/me/push-subscriptions');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await api('/me/push-subscriptions', {
        method: 'POST',
        body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
      });
      toast.show(t('permissionTitle'), 'success');
    } catch {
      toast.show(t('blocked'), 'error');
    } finally {
      setPending(false);
    }
  }

  if (state === 'granted' || state === 'unsupported') return null;

  return (
    <section className="rounded-lg bg-surface p-5">
      <p className="font-semibold">{t('permissionTitle')}</p>
      <p className="mt-1 text-sm text-ink-muted">
        {state === 'ios-needs-install' ? t('iosHint') : state === 'denied' ? t('blocked') : t('permissionBody')}
      </p>
      {state === 'default' ? (
        <Button className="mt-3" loading={pending} onClick={enable}>
          {t('permissionEnable')}
        </Button>
      ) : null}
    </section>
  );
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
