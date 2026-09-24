import { NavLink } from 'react-router-dom';
import { Apple, Bot, BookOpen, Camera, Home, PlusCircle, Ruler, Salad, Settings, Soup, Sparkles, Store, User } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/diary', label: 'Diary', icon: BookOpen },
  { to: '/add', label: 'Add Food', icon: PlusCircle },
  { to: '/add/scan', label: 'Scan', icon: Camera },
  { to: '/add/restaurants', label: 'Restaurants', icon: Store },
  { to: '/coach', label: 'AI Coach', icon: Bot },
  { to: '/nutrition', label: 'My Nutrition', icon: Soup },
  { to: '/stats', label: 'Statistics', icon: Salad },
  { to: '/measurements', label: 'Measurements', icon: Ruler },
  { to: '/favorites', label: 'Favorites', icon: Apple },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const openAssistant = useUIStore((s) => s.openAssistant);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-subtle bg-surface px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-lg">🥗</div>
        <span className="text-lg font-bold text-fg">Nutrition AI</span>
      </div>

      <button
        onClick={openAssistant}
        className="mb-3 flex items-center gap-3 rounded-xl bg-ink px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90"
      >
        <Sparkles size={19} />
        Ask AI
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-primary-50 text-primary-700' : 'text-muted hover:bg-surface-alt hover:text-fg'
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/add"
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600 active:scale-[0.98]"
      >
        <PlusCircle size={18} />
        Add Food
      </NavLink>
    </aside>
  );
}
