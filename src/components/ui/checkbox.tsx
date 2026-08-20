'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CheckboxFieldProps = {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
};

export function CheckboxField({ label, checked, onCheckedChange, disabled, error, className }: CheckboxFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <CheckboxPrimitive.Root
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-describedby={errorId}
          className={cn(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm border transition-colors',
            checked ? 'border-primary-500 bg-primary-500 text-neutral-50' : 'border-neutral-400 bg-surface',
          )}
        >
          <CheckboxPrimitive.Indicator>
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        <label htmlFor={id} className="text-sm leading-snug">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="pl-9 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
