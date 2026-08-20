'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export type SwitchFieldProps = {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

export function SwitchField({ label, description, checked, disabled, onCheckedChange, className }: SwitchFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-semibold">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-pill transition-colors disabled:opacity-50',
          checked ? 'bg-primary-500' : 'bg-neutral-300',
        )}
      >
        <SwitchPrimitive.Thumb className="block h-6 w-6 translate-x-0.5 rounded-pill bg-neutral-50 shadow-sm transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}
