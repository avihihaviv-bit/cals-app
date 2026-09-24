import { recommendationService, type RecommendedMeal } from './RecommendationService';
import { matchRestaurants, type RestaurantMatch } from './RestaurantService';
import { parseFoodPhrase, type ParsedFoodMention } from '@/utils/nlFoodParser';
import { generateDailySummary, generateStatsInsights, type DailySummary, type StatsInsight } from '@/utils/insights';
import type { DayStat } from '@/hooks/useHistoryStats';
import type { MacroTargets, NutritionFacts } from '@/types';

export interface AssistantContext {
  totals: NutritionFacts;
  targets: MacroTargets;
  last7Days: DayStat[]; // includes today, oldest first
  streakDays: number;
  isMinor: boolean;
}

export type AssistantCard =
  | { type: 'food_confirm'; mentions: ParsedFoodMention[] }
  | { type: 'meal_recommendations'; recs: RecommendedMeal[] }
  | { type: 'restaurant_matches'; matches: RestaurantMatch[] }
  | { type: 'daily_summary'; summary: DailySummary }
  | { type: 'stats_insights'; insights: StatsInsight[] }
  | { type: 'open_coach'; view: 'eat' | 'analyze' | 'recipe' | 'plan'; label: string };

export interface AssistantAnswer {
  text: string;
  card?: AssistantCard;
}

function remainingOf(ctx: AssistantContext): MacroTargets {
  return {
    calories: Math.max(ctx.targets.calories - ctx.totals.calories, 0),
    proteinG: Math.max(ctx.targets.proteinG - ctx.totals.proteinG, 0),
    carbsG: Math.max(ctx.targets.carbsG - ctx.totals.carbsG, 0),
    fatG: Math.max(ctx.targets.fatG - ctx.totals.fatG, 0),
  };
}

const ADD_VERB_EN = /^(add|log|i (?:ate|had|just ate|just had)|ate|had)\b/i;
const ADD_VERB_HE = /^(אכלתי|הוספתי|אני אוכל|תוסיף|רשמתי)/;

// A question ("How can I reach my protein goal?") should never be treated as
// a food-logging statement just because a word in it happens to match a
// food/category name (e.g. "protein"). Only auto-detect food-without-an-
// explicit-verb when the input doesn't look like a question. JS regex \b
// doesn't recognize Hebrew letters as word characters, so the Hebrew
// alternation is matched separately rather than folded into one \b-anchored
// pattern.
const QUESTION_START_EN = /^(what|how|why|when|where|who|which|can|could|should|is|are|do|does|find|analyze|show|will|would)\b/i;
const QUESTION_START_HE = /^(מה|איך|למה|מתי|איפה|מי|איזה|האם|כמה|תמצא|תבדוק|תראה|תגיד|יש)/;
const isHebrewText = (s: string) => /[\u0590-\u05FF]/.test(s);

/**
 * The single brain behind both the dedicated Coach page and the global
 * floating assistant. Everything here is local, rule-based reasoning over
 * the user's own stored data — there is no live LLM call. Every numeric
 * claim is computed directly from real state; nothing is invented.
 * Understands both English and Hebrew input, and replies in whichever
 * language the question was asked in.
 */
export function answerAssistant(rawInput: string, ctx: AssistantContext): AssistantAnswer {
  const input = rawInput.trim();
  const q = input.toLowerCase();
  const remaining = remainingOf(ctx);
  const he = isHebrewText(input);

  // 1. Explicit or implicit food logging ("add two bananas", "אכלתי שתי ביצים")
  const hasAddVerb = ADD_VERB_EN.test(q) || ADD_VERB_HE.test(input);
  const looksLikeQuestion = q.includes('?') || QUESTION_START_EN.test(q) || QUESTION_START_HE.test(input);
  const strippedForAdd = input.replace(ADD_VERB_EN, '').replace(ADD_VERB_HE, '').trim();
  const mentions = hasAddVerb || !looksLikeQuestion ? parseFoodPhrase(hasAddVerb ? strippedForAdd : input) : [];
  if (mentions.length > 0) {
    return {
      text: he ? 'הבנתי — הנה מה שזיהיתי:' : `Got it — here's what I understood:`,
      card: { type: 'food_confirm', mentions },
    };
  }

  // 2. Daily summary / "how am I doing" / "analyze my day"
  if (/analyze my day|how (am i|are you) doing|day in review|my day\b/.test(q) || /איך אכלתי|אכלתי טוב|נתח את היום|איך אני מתקדם|איך היה היום/.test(input)) {
    const last7ExcludingToday = ctx.last7Days.slice(0, -1);
    const summary = generateDailySummary(ctx.totals, ctx.targets, last7ExcludingToday, ctx.streakDays);
    return { text: summary.headline, card: { type: 'daily_summary', summary } };
  }

  // 3. Stats / trends / insights
  if (/insight|trend|stats|statistics|how (was|is) my week/.test(q) || /סטטיסטיק|מגמ|איך היה השבוע/.test(input)) {
    const insights = generateStatsInsights(ctx.last7Days, ctx.targets.proteinG);
    return { text: he ? 'הנה מה שמראים 7 הימים האחרונים שלך:' : "Here's what your last 7 days show:", card: { type: 'stats_insights', insights } };
  }

  // 4. Restaurants / eating out
  if (/restaurant|eat out|order|nearby|near me/.test(q) || /מסעדה|מסעדות|לאכול בחוץ|תזמין|קרוב אליי/.test(input)) {
    const matches = matchRestaurants(remaining);
    if (matches.length === 0) {
      return { text: he ? 'לא מצאתי מסעדה שמתאימה טוב כרגע — נסה לעיין בלשונית המסעדות ישירות.' : "I couldn't find a restaurant that fits well right now — try browsing the Restaurants tab directly." };
    }
    return {
      text: he ? 'בהתבסס על מה שנשאר לך היום, הנה מה שהכי מתאים:' : `Based on what you have left today, here's what fits best:`,
      card: { type: 'restaurant_matches', matches },
    };
  }

  // 4.5 Goal intent: bulk/gain muscle, cut/fat loss, recomposition — teens
  // get supportive, non-extreme guidance instead of a hard numeric target.
  if (/\b(bulk|gain (weight|muscle)|build muscle|get bigger)\b/.test(q) || /לעלות במסה|לבנות שריר|לעלות במשקל בצורה בריאה|להתחזק/.test(input)) {
    return {
      text: he
        ? ctx.isMinor
          ? 'בואו נתמקד בתמיכה בצמיחת שריר עם מספיק אוכל, חלבון, פחמימות, מנוחה ואימוני כוח — ולא בניסיון לעלות במשקל כמה שיותר מהר. התוכנית שלך כבר משקפת מספרים עדינים ובטוחים לגיל ההתבגרות.'
          : 'בניית שריר עובדת הכי טוב עם עודף קלורי מתון, מספיק חלבון, אימוני כוח מתקדמים ומנוחה עקבית. התוכנית הנוכחית שלך כבר בנויה לכך — בדוק את המאקרו שלך בדף הבית.'
        : ctx.isMinor
          ? "Let's focus on supporting muscle growth with enough food, protein, carbohydrates, recovery, and strength training — rather than trying to gain weight as fast as possible. Your plan already reflects gentle, growth-safe numbers."
          : "Got it — building muscle works best with a modest calorie surplus, enough protein, progressive strength training, and consistent recovery. Your current plan is already set up for that; check your macros on the Dashboard.",
    };
  }
  if (/\b(cut|lose fat|fat loss|shred|get lean|get shredded)\b/.test(q) || /לרדת בשומן|להתחטב|לירידה במשקל|לחתוך שומן/.test(input)) {
    return {
      text: he
        ? ctx.isMinor
          ? 'בואו נתמקד בהרגלים בריאים ותזונה מספקת בזמן שאתה עדיין בגיל צמיחה — מספיק אנרגיה, אוכל עשיר בערכים תזונתיים, פעילות ושינה — ולא בהגבלה קלורית אגרסיבית. התוכנית שלך כבר משתמשת במספרים עדינים ובטוחים לגיל ההתבגרות.'
          : 'לירידה בשומן, גירעון קלורי מתון בשילוב מספיק חלבון ופעילות סדירה בדרך כלל עובד הכי טוב לטווח ארוך — התוכנית הנוכחית שלך כבר משקפת קצב בר-קיימא ולא קיצוני.'
        : ctx.isMinor
          ? "Let's focus on healthy habits and adequate nutrition while you're still growing — enough energy, nutrient-dense food, activity, and sleep — rather than aggressive calorie restriction. Your plan already uses gentle, growth-safe numbers."
          : "For fat loss, a moderate calorie deficit combined with enough protein and regular activity tends to work best long-term — your current plan already reflects a sustainable pace rather than an extreme one.",
    };
  }
  if (/\brecomp(osition)?\b/.test(q) || /רקומפוזיצי/.test(input)) {
    return {
      text: he
        ? ctx.isMinor
          ? 'רקומפוזיציה בגיל שלך היא בעיקר אימוני כוח עקביים, מספיק חלבון, ארוחות מאוזנות והתאוששות טובה — לא מרדף אחרי מספר ספציפי במשקל.'
          : 'רקומפוזיציה (בניית שריר תוך ירידה בשומן) נשענת על אימוני כוח, מספיק חלבון, והישארות קרוב לקלוריות תחזוקה — זה תהליך איטי ועקבי ולא שינוי מהיר.'
        : ctx.isMinor
          ? "Recomposition at your age is mostly about consistent strength training, enough protein, balanced meals, and good recovery — not chasing a specific number on the scale."
          : "Recomposition (building muscle while losing fat) relies on strength training, enough protein, and staying close to maintenance calories — it's a slow, steady process rather than a quick transformation.",
    };
  }

  // 4.6 Recipe creation
  if (/\b(recipe|cook (me|something)|make me (a|some))\b/.test(q) || /מתכון|תבשל לי|תכין לי|בשל לי/.test(input)) {
    return {
      text: he
        ? 'יוצר המתכונים החכם יכול לבנות לך מתכון לפי הקלוריות, החלבון, זמן ההכנה ומה שיש לך בבית.'
        : 'The AI Recipe Creator can build one to your calories, protein, cooking time, and what you have on hand.',
      card: { type: 'open_coach', view: 'recipe', label: he ? 'פתח את יוצר המתכונים' : 'Open Recipe Creator' },
    };
  }

  // 4.7 Meal plan build/analyze
  if (/\bmeal plan|weekly plan|plan (my|the) (week|meals)\b/.test(q) || /תפריט שבועי|תוכנית ארוחות|בנה לי תפריט|תפריט יומי/.test(input)) {
    return {
      text: he ? 'אני יכול לבנות תוכנית רב-יומית לפי היעדים שלך, או לבדוק תוכנית שכבר בנית.' : 'I can build a multi-day plan around your targets, or review one you already have.',
      card: { type: 'open_coach', view: 'plan', label: he ? 'פתח את בונה התפריטים' : 'Open Meal Plan Builder' },
    };
  }

  // 4.8 What's missing today — a quick cross-macro summary
  if (/what('s| is)? (missing|left)|what do i (still )?need/.test(q) || /מה חסר לי|מה עוד אני צריך|מה נשאר לי/.test(input)) {
    const bits: string[] = [];
    const bitsHe: string[] = [];
    if (remaining.calories > 0) {
      bits.push(`${Math.round(remaining.calories)} kcal`);
      bitsHe.push(`${Math.round(remaining.calories)} קלוריות`);
    }
    if (remaining.proteinG > 0) {
      bits.push(`${Math.round(remaining.proteinG)}g protein`);
      bitsHe.push(`${Math.round(remaining.proteinG)} גרם חלבון`);
    }
    if (remaining.carbsG > 0) {
      bits.push(`${Math.round(remaining.carbsG)}g carbs`);
      bitsHe.push(`${Math.round(remaining.carbsG)} גרם פחמימות`);
    }
    if (remaining.fatG > 0) {
      bits.push(`${Math.round(remaining.fatG)}g fat`);
      bitsHe.push(`${Math.round(remaining.fatG)} גרם שומן`);
    }
    return {
      text: he
        ? bitsHe.length > 0
          ? `עדיין נשאר לך בערך ${bitsHe.join(', ')} להיום.`
          : 'הגעת לכל היעדים שלך היום — כל הכבוד.'
        : bits.length > 0
          ? `You still have about ${bits.join(', ')} remaining today.`
          : "You've reached all your targets for today — nice work.",
    };
  }

  // 5. What should I eat / cook / hungry / meal-type words
  if (
    /what (should|can) i (eat|have|cook)|hungry|dinner|lunch|breakfast|snack|build me a meal|plan (my|a) (dinner|lunch|meal)/.test(q) ||
    /מה כדאי לי לאכול|מה כדאי לאכול|רעב|רעבה|ארוחת בוקר|ארוחת צהריים|ארוחת ערב|חטיף|תבנה לי ארוחה/.test(input)
  ) {
    const recs = recommendationService.recommendMeals(remaining, 3);
    if (recs.length === 0 || remaining.calories < 100) {
      return {
        text: he
          ? 'אתה קרוב ליעד הקלוריות של היום — חטיף קל או קצת מים כנראה כל מה שצריך כרגע.'
          : "You're close to today's calorie goal — a light snack or some water might be all you need right now.",
      };
    }
    return {
      text: he
        ? `הנה מה שהכי מתאים עם בערך ${Math.round(remaining.calories)} קלוריות ו-${Math.round(remaining.proteinG)} גרם חלבון שנשארו:`
        : `Here's what fits best with about ${Math.round(remaining.calories)} kcal and ${Math.round(remaining.proteinG)}g protein remaining:`,
      card: { type: 'meal_recommendations', recs },
    };
  }

  // 6. Calories remaining
  if ((/calorie|kcal/.test(q) && /left|remain|how many/.test(q)) || (/קלוריות/.test(input) && /נשארו|כמה נשאר/.test(input))) {
    return {
      text: he
        ? `נשארו לך בערך ${Math.round(remaining.calories)} קלוריות להיום.`
        : `You have approximately ${Math.round(remaining.calories)} kcal remaining today.`,
    };
  }

  // 7. Protein
  if (/protein/.test(q) || /חלבון/.test(input)) {
    return {
      text: he
        ? remaining.proteinG > 0
          ? `נשארו לך בערך ${Math.round(remaining.proteinG)} גרם חלבון כדי להגיע ליעד של ${ctx.targets.proteinG} גרם.`
          : `כבר הגעת ליעד החלבון שלך של ${ctx.targets.proteinG} גרם היום — כל הכבוד.`
        : remaining.proteinG > 0
          ? `You have about ${Math.round(remaining.proteinG)}g of protein left to hit your target of ${ctx.targets.proteinG}g.`
          : `You've already hit your protein target of ${ctx.targets.proteinG}g today — nice work.`,
    };
  }

  // 8. Greeting
  if (/^(hi|hello|hey)\b/.test(q) || /^(היי|שלום|הי)\b/.test(input)) {
    return {
      text: he
        ? 'היי! תשאל אותי דברים כמו "מה כדאי לאכול?", "איך אכלתי היום?", או פשוט תגיד לי מה אכלת.'
        : "Hey! Ask me things like \"What should I eat?\", \"Analyze my day\", or just tell me what you ate.",
    };
  }

  return {
    text: he
      ? 'אני יכול לעזור עם מה שרשום ביומן שלך היום — נסה "מה כדאי לאכול?", "איך אכלתי היום?", "תמצא לי מסעדה", או פשוט ספר לי מה אכלת, למשל "שתי ביצים וטוסט".'
      : "I can help with what's in your log today — try \"What should I eat?\", \"Analyze my day\", \"Find me a restaurant\", or tell me what you ate, like \"two eggs and toast\".",
  };
}

export function getQuickActions(language: 'en' | 'he' = 'en'): readonly string[] {
  if (language === 'he') {
    return ['מה כדאי לי לאכול עכשיו?', 'איך אכלתי היום?', 'תמצא לי מסעדה', 'איך אני משלים חלבון?'] as const;
  }
  return ['What should I eat now?', 'Analyze my day', 'Find me a restaurant', 'How can I reach my protein goal?'] as const;
}
