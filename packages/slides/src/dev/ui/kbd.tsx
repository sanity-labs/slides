import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export const Kbd = ({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) => (
  <kbd
    className={cn(
      'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-muted px-1.5',
      'font-mono text-xs font-medium text-text-muted',
      className,
    )}
  >
    {children}
  </kbd>
);
