import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600 shadow-card',
  secondary: 'bg-surface-alt2 text-fg hover:bg-surface-alt3',
  ghost: 'bg-transparent text-fg hover:bg-surface-alt2',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
};

const SIZES: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-base rounded-xl gap-2',
};

export function Button({ variant = 'primary', size = 'md', icon, fullWidth, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
