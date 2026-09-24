import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeightLogEntry } from '@/types';

export function WeightChart({ data }: { data: WeightLogEntry[] }) {
  const chartData = data.map((d) => ({
    label: shortLabel(d.date),
    weight: d.weightKg,
  }));

  const values = data.map((d) => d.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.2);

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-fg">Weight</h3>
        <span className="text-xs text-muted">{data.length} entries</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA1AC' }} />
          <YAxis domain={[min - pad, max + pad]} hide />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(16,24,40,0.12)', fontSize: 12 }}
            formatter={(v: number) => [`${v} kg`, 'Weight']}
          />
          <Line type="monotone" dataKey="weight" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return new Date(2020, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
