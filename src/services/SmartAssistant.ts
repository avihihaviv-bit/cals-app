import { answerAssistant, extractFoodLogText, isHebrewText, type AssistantAnswer, type AssistantContext } from './AssistantService';
import { chatWithGemini, GeminiError, type ChatTurn } from './geminiVision';
import { getGeminiKey } from '@/utils/geminiKey';
import { FOODS } from '@/data/foods';

const REFERENCE_TABLE = FOODS.map(
  (f) => `${f.name}: ${f.per100g.calories} kcal, P ${f.per100g.proteinG}g, C ${f.per100g.carbsG}g, F ${f.per100g.fatG}g`,
).join('\n');

const MAX_HISTORY_TURNS = 12;

function round(n: number) {
  return Math.round(n);
}

/** Everything the live AI knows about the user — all of it real, computed from what's stored on this device. */
function buildSystemPrompt(ctx: AssistantContext): string {
  const p = ctx.profile;
  const remaining = {
    calories: round(ctx.targets.calories - ctx.totals.calories),
    proteinG: round(ctx.targets.proteinG - ctx.totals.proteinG),
    carbsG: round(ctx.targets.carbsG - ctx.totals.carbsG),
    fatG: round(ctx.targets.fatG - ctx.totals.fatG),
  };
  const entries = ctx.todayEntries ?? [];
  const eatenToday = entries.length
    ? entries
        .map((e) => `- ${e.mealType}: ${e.foodName}, ${e.servingLabel} → ${round(e.nutrition.calories)} kcal, ${round(e.nutrition.proteinG)}g protein, ${round(e.nutrition.carbsG)}g carbs, ${round(e.nutrition.fatG)}g fat`)
        .join('\n')
    : '- Nothing logged yet today.';
  const week = ctx.last7Days
    .filter((d) => d.hasEntries)
    .map((d) => `- ${d.date}: ${round(d.totals.calories)} kcal, ${round(d.totals.proteinG)}g protein`)
    .join('\n') || '- No logged days this week.';

  const profileLines = p
    ? [
        p.name ? `Name: ${p.name}` : null,
        `Age: ${p.age}, sex: ${p.sex}, height: ${p.heightCm} cm, weight: ${p.weightKg} kg`,
        `Activity: ${p.activityLevel}, trains ${p.trainingDaysPerWeek} days/week${p.trainingTypes?.length ? ` (${p.trainingTypes.join(', ')})` : ''}`,
        `Goal: ${p.goal}${p.goalPace ? ` (pace: ${p.goalPace})` : ''}`,
        p.dietaryRestrictions?.length ? `Dietary restrictions: ${p.dietaryRestrictions.join(', ')}` : null,
        p.allergyNotes ? `Allergy notes (always respect): ${p.allergyNotes}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No profile yet.';

  return `You are the friendly nutrition coach inside a personal nutrition-tracking app. Today is ${new Date().toDateString()}.

About the user:
${profileLines}

Daily targets: ${ctx.targets.calories} kcal, ${ctx.targets.proteinG}g protein, ${ctx.targets.carbsG}g carbs, ${ctx.targets.fatG}g fat.
Eaten so far today: ${round(ctx.totals.calories)} kcal, ${round(ctx.totals.proteinG)}g protein, ${round(ctx.totals.carbsG)}g carbs, ${round(ctx.totals.fatG)}g fat.
Remaining today: ${remaining.calories} kcal, ${remaining.proteinG}g protein, ${remaining.carbsG}g carbs, ${remaining.fatG}g fat (negative = over target).
Logging streak: ${ctx.streakDays} days.

Today's log:
${eatenToday}

Last 7 days:
${week}

How to answer:
- Reply in the same language the user wrote in (Hebrew or English). Hebrew answers should be natural, everyday Hebrew, and use gender-neutral phrasing when you can.
- Be short and practical: usually 2–5 sentences or a short list. Plain text only — no markdown headers, no tables, no bold markers.
- Use the real numbers above when they matter. Never invent foods they ate or numbers that aren't above; if you don't know, say so.
- When suggesting food, give concrete foods with approximate amounts and their calories/protein, fitting what's remaining today.
- ${ctx.isMinor ? 'The user is a teenager: never recommend calorie restriction, fasting, or rapid weight change. Focus on enough food, protein, growth, sleep and healthy habits.' : 'Avoid extreme diets; favor sustainable advice.'}
- You are not a doctor. For medical conditions, eating-disorder signs, or medication questions, gently suggest talking to a doctor or dietitian.
- To log food, the user can just write "I ate …" / "אכלתי …" in this chat, or use Scan Food.
- When you quote nutrition numbers, use the app's reference values below when the food is listed (per 100 g, verified USDA data), scaled to the amount. For other foods use standard USDA values. Show the math briefly for amounts (e.g. "150 g × 31 g/100 g ≈ 47 g protein").

App reference values (per 100 g):
${REFERENCE_TABLE}`;
}

/**
 * The assistant's brain when the user has a Gemini key: local, data-backed
 * answers (cards built from real stored data) stay local; everything else —
 * open questions, advice, explanations — goes to Gemini with the user's real
 * context. Food-logging statements are looked up by AI so any food works,
 * not just the ones in the built-in list. Without a key it's the same
 * rule-based assistant as before.
 */
export async function answerSmart(rawInput: string, ctx: AssistantContext, history: ChatTurn[]): Promise<AssistantAnswer> {
  const input = rawInput.trim();
  const he = isHebrewText(input);
  const local = answerAssistant(input, ctx);
  const apiKey = getGeminiKey();
  if (!apiKey) return local;

  const foodText = extractFoodLogText(input) ?? (local.card?.type === 'food_confirm' ? input : null);
  if (foodText) {
    return {
      text: he ? 'הנה הערכים התזונתיים:' : "Here's the nutrition for that:",
      card: { type: 'ai_food_lookup', description: foodText },
    };
  }

  if (local.card) return local;

  try {
    const turns = [...history.slice(-MAX_HISTORY_TURNS), { role: 'user' as const, text: input }];
    const reply = await chatWithGemini(apiKey, buildSystemPrompt(ctx), turns);
    return { text: reply.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '') };
  } catch (err) {
    const why = err instanceof GeminiError ? err.message : he ? 'משהו השתבש.' : 'Something went wrong.';
    return { text: `${why}\n\n${local.text}` };
  }
}
