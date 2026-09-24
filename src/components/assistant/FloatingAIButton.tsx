import { Sparkles } from 'lucide-react';

export function FloatingAIButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open AI Assistant"
      className="fixed bottom-6 right-6 z-30 hidden h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-floating transition hover:scale-105 active:scale-95 lg:flex"
    >
      <Sparkles size={22} />
    </button>
  );
}
