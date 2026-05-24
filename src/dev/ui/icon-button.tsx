import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  readonly icon: ReactNode;
  readonly label: string;
  readonly selected?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, selected = false, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={selected || undefined}
      data-selected={selected || undefined}
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink/70',
        'transition-colors hover:bg-ink/5 hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'data-selected:bg-ink/10 data-selected:text-ink data-selected:hover:bg-ink/15',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
