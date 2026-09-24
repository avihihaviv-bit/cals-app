import { create } from 'zustand';

/** Ephemeral, non-persisted UI state shared across the app (not app data). */
interface UIState {
  assistantOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  assistantOpen: false,
  openAssistant: () => set({ assistantOpen: true }),
  closeAssistant: () => set({ assistantOpen: false }),
}));
