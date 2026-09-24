import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { DayStat } from '@/hooks/useHistoryStats';

export function ProteinChart({ data, goal }: { data: DayStat[]; goal: number }) {
  const chartData = data.map((d) => ({
    label: shortLabel(d.date),
    protein: Math.round(d.totals.proteinG),
  }));

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-fg">Protein</h3>
        <span className="text-xs text-muted">Last 7 days</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#F1F3F5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA1AC' }} />
          <Tooltip
            cursor={{ fill: '#F7F8FA' }}
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(16,24,40,0.12)', fontSize: 12 }}
            formatter={(v: number) => [`${v} g`, 'Protein']}
          />
          <ReferenceLine y={goal} stroke="#84CC16" strokeDasharray="4 4" />
          <Bar dataKey="protein" fill="#F97316" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return new Date(2020, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}
