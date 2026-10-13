import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  active?: boolean;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

export function Button({ variant = 'default', active, size = 'md', className = '', icon, children, ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded border text-[13px] leading-none transition-colors select-none disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
  const pad = size === 'sm' ? 'h-7 min-w-7 px-1.5' : 'h-8 px-3';
  const look =
    variant === 'primary'
      ? 'bg-accent border-accent text-white hover:bg-[#2449c4]'
      : variant === 'danger'
        ? 'border-rule bg-white text-red-700 hover:bg-red-50'
        : variant === 'ghost'
          ? `border-transparent hover:bg-black/5 ${active ? 'bg-accent-soft text-accent' : ''}`
          : `border-rule bg-white hover:bg-black/5 ${active ? 'bg-accent-soft border-accent text-accent' : ''}`;
  return (
    <button type="button" className={`${base} ${pad} ${look} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
