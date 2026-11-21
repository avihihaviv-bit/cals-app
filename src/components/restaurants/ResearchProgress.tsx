import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const STEPS = ['מזהה את המסעדה', 'מחפש באינטרנט את האתר הרשמי והתפריט', 'מחפש מידע תזונתי רשמי', 'מחשב ערכים למנות בלי מידע רשמי', 'בודק עקביות ושומר במאגר'];

/** Shown while the AI researcher works (typically 20–90 seconds). The steps describe what the AI does, not a measured progress bar. */
export function ResearchProgress({ title }: { title: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl2 bg-surface p-6 text-right shadow-card"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-50">
          <Loader2 size={24} className="animate-spin text-primary-600" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-fg">ה-AI חוקר את {title}</p>
          <p className="text-xs text-muted">בדרך כלל 20–90 שניות · עברו {seconds} שניות</p>
        </div>
      </div>
      <p className="mt-4 text-xs font-semibold text-muted">מה ה-AI עושה:</p>
      <ul className="mt-1.5 space-y-1.5">
        {STEPS.map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            className="flex items-center gap-2 text-sm text-fg/80"
          >
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary-500" style={{ animationDelay: `${i * 0.3}s` }} />
            {s}
          </motion.li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-faint">אפשר להישאר במסך — התוצאות יישמרו ולא יהיה צורך לחקור שוב.</p>
    </motion.div>
  );
}
