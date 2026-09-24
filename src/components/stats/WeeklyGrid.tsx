import { useNavigate } from 'react-router-dom';
import { WEEKDAY_LABELS, isToday, weekDays } from '@/utils/date';
import { useDayStats } from '@/hooks/useHistoryStats';
import { todayISO } from '@/utils/date';

export function WeeklyGrid() {
  const navigate = useNavigate();
  const days = weekDays(todayISO());
  const stats = useDayStats(days);

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-fg">This week</h3>
      <div className="grid grid-cols-7 gap-1.5">
        {stats.map((d, i) => {
          const today = isToday(d.date);
          return (
            <button
              key={d.date}
              onClick={() => navigate(`/diary?date=${d.date}`)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition active:scale-95 ${
                today ? 'bg-primary-500 text-white' : 'bg-surface-alt text-fg hover:bg-surface-alt2'
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase ${today ? 'text-primary-50' : 'text-muted'}`}>
                {WEEKDAY_LABELS[i]}
              </span>
              {d.hasEntries ? (
                <>
                  <span className="text-[11px] font-bold tabular-nums">{Math.round(d.totals.calories)}</span>
                  <span className={`text-[9px] ${today ? 'text-primary-50' : 'text-muted'}`}>🥩{Math.round(d.totals.proteinG)}g</span>
                </>
              ) : (
                <span className={`text-[11px] ${today ? 'text-primary-50' : 'text-faint'}`}>—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
