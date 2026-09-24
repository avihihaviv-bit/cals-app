import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useLocaleStore, isRTL } from '@/store/useLocaleStore';
import { useApplyTheme } from '@/hooks/useApplyTheme';
import { AppShell } from '@/components/layout/AppShell';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

const DiaryPage = lazy(() => import('@/pages/DiaryPage').then((m) => ({ default: m.DiaryPage })));
const AddFoodHubPage = lazy(() => import('@/pages/AddFoodHubPage').then((m) => ({ default: m.AddFoodHubPage })));
const FoodSearchPage = lazy(() => import('@/pages/FoodSearchPage').then((m) => ({ default: m.FoodSearchPage })));
const ScanFoodPage = lazy(() => import('@/pages/ScanFoodPage').then((m) => ({ default: m.ScanFoodPage })));
const RestaurantsPage = lazy(() => import('@/pages/RestaurantsPage').then((m) => ({ default: m.RestaurantsPage })));
const RestaurantDetailPage = lazy(() => import('@/pages/RestaurantDetailPage').then((m) => ({ default: m.RestaurantDetailPage })));
const StatisticsPage = lazy(() => import('@/pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage })));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const MeasurementsPage = lazy(() => import('@/pages/MeasurementsPage').then((m) => ({ default: m.MeasurementsPage })));
const AICoachPage = lazy(() => import('@/pages/AICoachPage').then((m) => ({ default: m.AICoachPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NutritionPage = lazy(() => import('@/pages/NutritionPage').then((m) => ({ default: m.NutritionPage })));

export default function App() {
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const language = useLocaleStore((s) => s.language);
  useApplyTheme();

  useEffect(() => {
    document.documentElement.dir = isRTL(language) ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  if (!onboardingComplete) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/diary" element={<DiaryPage />} />
          <Route path="/add" element={<AddFoodHubPage />} />
          <Route path="/add/search" element={<FoodSearchPage />} />
          <Route path="/add/scan" element={<ScanFoodPage />} />
          <Route path="/add/restaurants" element={<RestaurantsPage />} />
          <Route path="/add/restaurants/:id" element={<RestaurantDetailPage />} />
          <Route path="/stats" element={<StatisticsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/measurements" element={<MeasurementsPage />} />
          <Route path="/coach" element={<AICoachPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/nutrition" element={<NutritionPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
