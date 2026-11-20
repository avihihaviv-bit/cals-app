import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { FloatingAIButton } from '@/components/assistant/FloatingAIButton';
import { AIAssistantPanel } from '@/components/assistant/AIAssistantPanel';
import { useUIStore } from '@/store/useUIStore';

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const assistantOpen = useUIStore((s) => s.assistantOpen);
  const openAssistant = useUIStore((s) => s.openAssistant);
  const closeAssistant = useUIStore((s) => s.closeAssistant);

  return (
    <div className="min-h-screen bg-bg">
      <div className="fixed inset-x-0 top-0 z-40">
        <OfflineBanner />
      </div>
      <Sidebar />
      <main className="min-h-screen pb-24 lg:ml-64 lg:pb-10">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">
          {/* Enter-only animation on purpose: wrapping this in AnimatePresence
              (exit animations) made the router render the NEW page inside the
              exiting wrapper and then mount it a second time, wiping its state
              — e.g. a finished photo scan jumped back to the camera screen. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </div>
      </main>
      <BottomNav />
      <FloatingAIButton onClick={openAssistant} />
      <AIAssistantPanel open={assistantOpen} onClose={closeAssistant} />
    </div>
  );
}
