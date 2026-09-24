import type { ReactNode } from 'react';

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  compact?: boolean;
}

export function OptionCard({ selected, onClick, title, description, icon, compact }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl2 border-2 text-left transition active:scale-[0.98] ${
        compact ? 'px-3.5 py-3' : 'px-4 py-3.5'
      } ${
        selected
          ? 'border-primary-500 bg-primary-50 shadow-card'
          : 'border-transparent bg-surface shadow-card hover:border-default'
      }`}
    >
      {icon && <div className="text-2xl leading-none">{icon}</div>}
      <div className="flex-1">
        <p className={`font-semibold ${selected ? 'text-primary-800' : 'text-fg'}`}>{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-primary-500 bg-primary-500' : 'border-strong'
        }`}
      >
        {selected && <div className="h-2 w-2 rounded-full bg-surface" />}
      </div>
    </button>
  );
}
