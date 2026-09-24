import { NavLink } from 'react-router-dom';
import { Home, Plus, Sparkles, User } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';

export function BottomNav() {
  const openAssistant = useUIStore((s) => s.openAssistant);
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-subtle bg-surface/95 backdrop-blur-md lg:hidden">
      <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
        <Home size={22} />
        <span>Home</span>
      </NavLink>

      <NavLink to="/diary" className={({ isActive }) => navClass(isActive)}>
        <span className="text-lg leading-none">📖</span>
        <span>Diary</span>
      </NavLink>

      <NavLink to="/add" className="relative -mt-6 flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium text-primary-700">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-floating transition active:scale-90">
          <Plus size={28} />
        </span>
      </NavLink>

      <button onClick={openAssistant} className={navClass(false)}>
        <Sparkles size={22} />
        <span>AI</span>
      </button>

      <NavLink to="/profile" className={({ isActive }) => navClass(isActive)}>
        <User size={22} />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

function navClass(isActive: boolean) {
  return `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition ${
    isActive ? 'text-primary-600' : 'text-muted'
  }`;
}
