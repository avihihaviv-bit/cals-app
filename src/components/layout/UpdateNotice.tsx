import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';

export function UpdateNotice() {
  const state = useAutoUpdate();
  const text =
    state === 'updating'
      ? 'Updating to the new version…'
      : state === 'waiting'
        ? 'New version ready — it installs when you finish this'
        : state === 'updated'
          ? 'Updated to the latest version ✓'
          : null;
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          role="status"
          className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-floating"
          style={{ marginTop: 'env(safe-area-inset-top)' }}
        >
          {state === 'updated' ? <Sparkles size={14} /> : <Loader2 size={14} className="animate-spin" />}
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
