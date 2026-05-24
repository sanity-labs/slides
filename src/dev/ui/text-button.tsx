import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type TextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon?: ReactNode;
  readonly selected?: boolean;
};

export const TextButton = forwardRef<HTMLButtonElement, TextButtonProps>(
  ({ icon, selected = false, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected || undefined}
      data-selected={selected || undefined}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink/80',
        'transition-colors hover:bg-ink/5 hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'data-selected:bg-ink/10 data-selected:text-ink data-selected:hover:bg-ink/15',
        icon ? 'pl-2.5' : '',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0 text-ink/60">{icon}</span> : null}
      {children}
    </button>
  ),
);
TextButton.displayName = 'TextButton';
