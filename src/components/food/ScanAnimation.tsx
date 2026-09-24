import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const STEPS = ['Detecting food…', 'Estimating portion size…', 'Calculating nutrition…'];

export function ScanAnimation() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, 550);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Viewfinder corners */}
      {[
        'left-4 top-4 border-l-2 border-t-2',
        'right-4 top-4 border-r-2 border-t-2',
        'left-4 bottom-4 border-l-2 border-b-2',
        'right-4 bottom-4 border-r-2 border-b-2',
      ].map((pos, i) => (
        <div key={i} className={`absolute h-6 w-6 rounded-sm border-white/70 ${pos}`} />
      ))}

      {/* Sweeping scan line */}
      <motion.div
        className="absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-primary-300 to-transparent shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]"
        animate={{ top: ['8%', '92%', '8%'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Ambient particles */}
      {[
        { left: '25%', top: '30%', delay: 0 },
        { left: '68%', top: '55%', delay: 0.4 },
        { left: '45%', top: '70%', delay: 0.8 },
      ].map((p, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-primary-300"
          style={{ left: p.left, top: p.top }}
          animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}

      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <p className="text-sm font-medium">{STEPS[stepIndex]}</p>
      </div>
    </div>
  );
}
