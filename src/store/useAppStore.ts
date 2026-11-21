import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/utils/id';
import { todayISO } from '@/utils/date';
import type {
  DiaryEntry,
  FavoriteItem,
  FoodItem,
  Restaurant,
  RestaurantDish,
  FoodRef,
  MealPlanDay,
  MeasurementEntry,
  MeasurementType,
  PhotoCategory,
  ProgressPhoto,
  RecentItem,
  SavedMealPlan,
  UserProfile,
  WeightLogEntry,
} from '@/types';

/** Shape written by Settings > Export my data — also what Import my data reads back in. */
export interface BackupData {
  profile?: UserProfile | null;
  diaryEntries?: DiaryEntry[];
  favorites?: FavoriteItem[];
  weightLog?: WeightLogEntry[];
  measurements?: MeasurementEntry[];
  progressPhotos?: ProgressPhoto[];
  waterLog?: Record<string, number>;
  customFoods?: FoodItem[];
  researchedRestaurants?: ResearchedRestaurant[];
}

/** A restaurant + menu found by the AI researcher, saved so it never has to be researched again. */
export interface ResearchedRestaurant {
  restaurant: Restaurant;
  dishes: RestaurantDish[];
}

interface AppState {
  profile: UserProfile | null;
  onboardingComplete: boolean;
  diaryEntries: DiaryEntry[];
  favorites: FavoriteItem[];
  recentItems: RecentItem[];
  weightLog: WeightLogEntry[];
  trackWeight: boolean;
  lastCheckInAt: string | null;
  checkInSnoozedUntil: string | null;
  units: 'metric' | 'imperial';
  waterLog: Record<string, number>; // date -> ml
  measurements: MeasurementEntry[];
  progressPhotos: ProgressPhoto[];
  savedMealPlans: SavedMealPlan[];
  /** Foods the user logged that aren't in the built-in database (AI lookups, nutrition labels) — searchable and re-loggable like any other food. */
  customFoods: FoodItem[];

  researchedRestaurants: ResearchedRestaurant[];
  /** Saves (or merges into) a researched restaurant: dishes with the same id are replaced, new ones added. */
  saveResearchedRestaurant: (entry: ResearchedRestaurant) => void;
  deleteResearchedRestaurant: (restaurantId: string) => void;

  saveCustomFoods: (foods: FoodItem[]) => void;
  deleteCustomFood: (id: string) => void;

  setProfile: (profile: UserProfile) => void;
  updateProfile: (partial: Partial<UserProfile>) => void;
  completeOnboarding: () => void;
  resetProfile: () => void;

  addDiaryEntry: (entry: Omit<DiaryEntry, 'id' | 'loggedAt'>) => void;
  updateDiaryEntry: (id: string, partial: Partial<DiaryEntry>) => void;
  removeDiaryEntry: (id: string) => void;
  clearDiaryHistory: () => void;
  clearWeightHistory: () => void;

  toggleFavorite: (ref: FoodRef) => void;
  isFavorite: (ref: FoodRef) => boolean;

  touchRecent: (ref: FoodRef) => void;

  addWeightLog: (weightKg: number, date?: string) => void;
  setTrackWeight: (track: boolean) => void;
  setUnits: (units: 'metric' | 'imperial') => void;
  recordCheckIn: (date?: string) => void;
  snoozeCheckIn: (untilDate: string) => void;

  addWater: (ml: number, date: string) => void;
  resetAllData: () => void;
  importBackup: (data: BackupData) => void;

  addMeasurement: (type: MeasurementType, valueCm: number, date?: string) => void;
  deleteMeasurement: (id: string) => void;
  deleteMeasurementHistory: (type: MeasurementType) => void;

  addProgressPhoto: (category: PhotoCategory, dataUrl: string, date?: string) => void;
  deleteProgressPhoto: (id: string) => void;
  deleteAllProgressPhotos: () => void;

  saveMealPlan: (plan: { name: string; days: MealPlanDay[]; origin: 'user' | 'ai' }) => string;
  updateMealPlan: (id: string, partial: Partial<Pick<SavedMealPlan, 'name' | 'days'>>) => void;
  deleteMealPlan: (id: string) => void;
}

const MAX_RECENT_ITEMS = 20;

function sameRef(a: FoodRef, b: FoodRef) {
  return a.refId === b.refId && a.refType === b.refType;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: null,
      onboardingComplete: false,
      diaryEntries: [],
      favorites: [],
      recentItems: [],
      weightLog: [],
      trackWeight: false,
      lastCheckInAt: null,
      checkInSnoozedUntil: null,
      units: 'metric',
      waterLog: {},
      measurements: [],
      progressPhotos: [],
      savedMealPlans: [],
      customFoods: [],
      researchedRestaurants: [],

      saveResearchedRestaurant: (entry) =>
        set((state) => {
          const existing = state.researchedRestaurants.find((x) => x.restaurant.id === entry.restaurant.id);
          if (!existing) return { researchedRestaurants: [...state.researchedRestaurants, entry] };
          const byId = new Map(existing.dishes.map((d) => [d.id, d]));
          for (const d of entry.dishes) byId.set(d.id, d);
          const sources = [...(existing.restaurant.sources ?? []), ...(entry.restaurant.sources ?? [])].filter(
            (s, i, arr) => arr.findIndex((x) => x.url === s.url) === i,
          );
          const merged: ResearchedRestaurant = {
            restaurant: { ...existing.restaurant, ...entry.restaurant, sources, grounded: existing.restaurant.grounded || entry.restaurant.grounded },
            dishes: [...byId.values()],
          };
          merged.restaurant.dishIds = merged.dishes.map((d) => d.id);
          return {
            researchedRestaurants: state.researchedRestaurants.map((x) => (x.restaurant.id === entry.restaurant.id ? merged : x)),
          };
        }),

      deleteResearchedRestaurant: (restaurantId) =>
        set((state) => ({ researchedRestaurants: state.researchedRestaurants.filter((x) => x.restaurant.id !== restaurantId) })),

      saveCustomFoods: (foods) =>
        set((state) => {
          const byId = new Map(state.customFoods.map((f) => [f.id, f]));
          for (const f of foods) byId.set(f.id, f);
          return { customFoods: [...byId.values()] };
        }),

      deleteCustomFood: (id) => set((state) => ({ customFoods: state.customFoods.filter((f) => f.id !== id) })),

      setProfile: (profile) => set({ profile }),

      updateProfile: (partial) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, ...partial, updatedAt: new Date().toISOString() }
            : state.profile,
        })),

      completeOnboarding: () => set({ onboardingComplete: true }),

      resetProfile: () => set({ profile: null, onboardingComplete: false }),

      addDiaryEntry: (entry) =>
        set((state) => ({
          diaryEntries: [
            ...state.diaryEntries,
            { ...entry, id: generateId('entry'), loggedAt: new Date().toISOString() },
          ],
        })),

      updateDiaryEntry: (id, partial) =>
        set((state) => ({
          diaryEntries: state.diaryEntries.map((e) => (e.id === id ? { ...e, ...partial } : e)),
        })),

      removeDiaryEntry: (id) =>
        set((state) => ({ diaryEntries: state.diaryEntries.filter((e) => e.id !== id) })),

      clearDiaryHistory: () => set({ diaryEntries: [] }),
      clearWeightHistory: () => set({ weightLog: [] }),

      toggleFavorite: (ref) =>
        set((state) => {
          const exists = state.favorites.some((f) => sameRef(f, ref));
          return {
            favorites: exists
              ? state.favorites.filter((f) => !sameRef(f, ref))
              : [...state.favorites, { ...ref, addedAt: new Date().toISOString() }],
          };
        }),

      isFavorite: (ref) => get().favorites.some((f) => sameRef(f, ref)),

      touchRecent: (ref) =>
        set((state) => {
          const existing = state.recentItems.find((r) => sameRef(r, ref));
          const now = new Date().toISOString();
          let next: RecentItem[];
          if (existing) {
            next = [
              { ...existing, lastUsedAt: now, useCount: existing.useCount + 1 },
              ...state.recentItems.filter((r) => !sameRef(r, ref)),
            ];
          } else {
            next = [{ ...ref, lastUsedAt: now, useCount: 1 }, ...state.recentItems];
          }
          return { recentItems: next.slice(0, MAX_RECENT_ITEMS) };
        }),

      addWeightLog: (weightKg, date = todayISO()) =>
        set((state) => {
          const withoutDate = state.weightLog.filter((w) => w.date !== date);
          return { weightLog: [...withoutDate, { date, weightKg }].sort((a, b) => a.date.localeCompare(b.date)) };
        }),

      setTrackWeight: (track) => set({ trackWeight: track }),
      setUnits: (units) => set({ units }),

      recordCheckIn: (date = todayISO()) => set({ lastCheckInAt: date, checkInSnoozedUntil: null }),
      snoozeCheckIn: (untilDate) => set({ checkInSnoozedUntil: untilDate }),

      addWater: (ml, date) =>
        set((state) => ({
          waterLog: { ...state.waterLog, [date]: Math.max(0, (state.waterLog[date] ?? 0) + ml) },
        })),

      addMeasurement: (type, valueCm, date = todayISO()) =>
        set((state) => ({
          measurements: [
            ...state.measurements,
            { id: generateId('meas'), type, valueCm, date, loggedAt: new Date().toISOString() },
          ].sort((a, b) => a.date.localeCompare(b.date)),
        })),

      deleteMeasurement: (id) =>
        set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })),

      deleteMeasurementHistory: (type) =>
        set((state) => ({ measurements: state.measurements.filter((m) => m.type !== type) })),

      addProgressPhoto: (category, dataUrl, date = todayISO()) =>
        set((state) => ({
          progressPhotos: [
            ...state.progressPhotos,
            { id: generateId('photo'), category, dataUrl, date, loggedAt: new Date().toISOString() },
          ],
        })),

      deleteProgressPhoto: (id) =>
        set((state) => ({ progressPhotos: state.progressPhotos.filter((p) => p.id !== id) })),

      deleteAllProgressPhotos: () => set({ progressPhotos: [] }),

      saveMealPlan: (plan) => {
        const id = generateId('plan');
        set((state) => ({
          savedMealPlans: [
            ...state.savedMealPlans,
            { id, name: plan.name, days: plan.days, origin: plan.origin, createdAt: new Date().toISOString() },
          ],
        }));
        return id;
      },

      updateMealPlan: (id, partial) =>
        set((state) => ({
          savedMealPlans: state.savedMealPlans.map((p) => (p.id === id ? { ...p, ...partial } : p)),
        })),

      deleteMealPlan: (id) =>
        set((state) => ({ savedMealPlans: state.savedMealPlans.filter((p) => p.id !== id) })),

      resetAllData: () =>
        set({
          profile: null,
          onboardingComplete: false,
          diaryEntries: [],
          favorites: [],
          recentItems: [],
          weightLog: [],
          trackWeight: false,
          lastCheckInAt: null,
          checkInSnoozedUntil: null,
          waterLog: {},
          measurements: [],
          progressPhotos: [],
          savedMealPlans: [],
          customFoods: [],
          researchedRestaurants: [],
        }),

      importBackup: (data) =>
        set((state) => ({
          profile: data.profile ?? state.profile,
          onboardingComplete: data.profile ? true : state.onboardingComplete,
          diaryEntries: data.diaryEntries ?? state.diaryEntries,
          favorites: data.favorites ?? state.favorites,
          weightLog: data.weightLog ?? state.weightLog,
          measurements: data.measurements ?? state.measurements,
          progressPhotos: data.progressPhotos ?? state.progressPhotos,
          waterLog: data.waterLog ?? state.waterLog,
          customFoods: data.customFoods ?? state.customFoods,
          researchedRestaurants: data.researchedRestaurants ?? state.researchedRestaurants,
        })),
    }),
    {
      name: 'nutrition-ai-store',
      version: 1,
    },
  ),
);
