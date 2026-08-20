'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info'; action?: { label: string; onClick: () => void } };

type ToastApi = {
  show: (message: string, tone?: Toast['tone'], action?: Toast['action']) => void;
};

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** docs/05 §3.3 — toasts auto-dismiss after 4 s and are announced politely. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback<ToastApi['show']>((message, tone = 'info', action) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone, action }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+80px)] lg:pb-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md px-4 py-3 text-sm shadow-md',
              toast.tone === 'success' && 'bg-success text-neutral-50',
              toast.tone === 'error' && 'bg-danger text-neutral-50',
              toast.tone === 'info' && 'bg-neutral-900 text-neutral-50',
            )}
          >
            <span>{toast.message}</span>
            {toast.action ? (
              <button type="button" onClick={toast.action.onClick} className="shrink-0 font-semibold underline">
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
