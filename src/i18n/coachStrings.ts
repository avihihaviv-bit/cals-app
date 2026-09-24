import { useLocaleStore } from '@/store/useLocaleStore';

/**
 * Translation dictionary scoped to the AI Coach home screen — the literal
 * subject of the Hebrew/RTL request. Most of the rest of the app (Dashboard,
 * Diary, Search, Profile, Onboarding...) is not translated in this pass;
 * switching language still flips the whole document's dir/lang (so base
 * text alignment is correct everywhere), and the chat assistant understands
 * and replies in Hebrew everywhere it's used — but those other screens keep
 * their English copy for now.
 */
const STRINGS = {
  en: {
    title: 'Nutrition AI',
    subtitle: "I know your targets and what you've eaten today. What can I help with?",
    caloriesLeft: 'kcal left',
    proteinLeft: 'g protein left',
    carbsLeft: 'g carbs left',
    fatLeft: 'g fat left',
    quickActions: 'Quick actions',
    whatToEat: 'What should I eat now?',
    howDidIEat: 'How did I eat today?',
    highProtein: 'Find high protein',
    lowCalorie: 'Low-calorie meal',
    findRestaurant: 'Find me a restaurant',
    createRecipe: 'Create a recipe',
    checkPlan: 'Check my meal plan',
    askAi: 'Ask AI',
    recommendationForYou: 'Recommendation for you',
    typeSomething: 'Type what you want…',
    debugLink: 'Calculation debug',
    back: 'Back',
    language: 'Language',
    thinking: 'Thinking…',
    tryAsking: 'Try asking',
    buildPlan: 'Build a Plan',
    analyzePlan: 'Analyze a Plan',
    titleEat: 'What Should I Eat?',
    titleAnalyze: 'Analyze My Day',
    titleRecipe: 'Create a Recipe',
    titlePlan: 'Build / Analyze Meal Plan',
    titleRestaurant: 'Find a Restaurant',
    titleProtein: 'High Protein Options',
    titleCalories: 'Low-Calorie Options',
    titleDebug: 'Calculation Debug',
  },
  he: {
    title: 'תזונה AI',
    subtitle: 'אני מכיר את היעדים שלך ואת מה שאכלת היום. במה לעזור לך?',
    caloriesLeft: 'קלוריות נשארו',
    proteinLeft: 'גרם חלבון נשארו',
    carbsLeft: 'גרם פחמימות נשארו',
    fatLeft: 'גרם שומן נשארו',
    quickActions: 'פעולות מהירות',
    whatToEat: 'מה כדאי לי לאכול עכשיו?',
    howDidIEat: 'איך אכלתי היום?',
    highProtein: 'מצא לי הרבה חלבון',
    lowCalorie: 'ארוחה דלה בקלוריות',
    findRestaurant: 'מצא לי מסעדה',
    createRecipe: 'צור לי מתכון',
    checkPlan: 'בדוק את התפריט שלי',
    askAi: 'שאל את ה-AI',
    recommendationForYou: 'המלצה בשבילך',
    typeSomething: 'כתוב מה אתה רוצה…',
    debugLink: 'דיבוג חישוב',
    back: 'חזרה',
    language: 'שפה',
    thinking: 'חושב…',
    tryAsking: 'נסה לשאול',
    buildPlan: 'בנה תפריט',
    analyzePlan: 'נתח תפריט',
    titleEat: 'מה כדאי לי לאכול?',
    titleAnalyze: 'ניתוח היום שלי',
    titleRecipe: 'צור מתכון',
    titlePlan: 'בניית / ניתוח תפריט',
    titleRestaurant: 'מצא מסעדה',
    titleProtein: 'אפשרויות עתירות חלבון',
    titleCalories: 'אפשרויות דלות קלוריות',
    titleDebug: 'דיבוג חישוב',
  },
} as const;

export type CoachStringKey = keyof typeof STRINGS.en;

export function useCoachT() {
  const language = useLocaleStore((s) => s.language);
  return (key: CoachStringKey) => STRINGS[language][key];
}
