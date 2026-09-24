import { Lightbulb } from 'lucide-react';
import type { MacroTargets, NutritionFacts } from '@/types';

interface SmartSuggestionsProps {
  totals: NutritionFacts;
  targets: MacroTargets;
  hasEntries: boolean;
}

export function SmartSuggestions({ totals, targets, hasEntries }: SmartSuggestionsProps) {
  const messages = buildSuggestions(totals, targets, hasEntries);
  if (messages.length === 0) return null;

  return (
    <div className="space-y-2">
      {messages.map((msg, i) => (
        <div key={i} className="flex items-start gap-2.5 rounded-xl2 bg-primary-50 px-4 py-3 text-sm text-primary-800 animate-fade-in">
          <Lightbulb size={16} className="mt-0.5 shrink-0" />
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

function buildSuggestions(totals: NutritionFacts, targets: MacroTargets, hasEntries: boolean): string[] {
  const msgs: string[] = [];
  const hour = new Date().getHours();

  if (!hasEntries) {
    msgs.push("You haven't logged anything yet today — scan or search a food to get started.");
    return msgs;
  }

  const remainingCalories = targets.calories - totals.calories;
  if (remainingCalories > 0) {
    msgs.push(`You have approximately ${Math.round(remainingCalories)} kcal remaining today.`);
  } else if (remainingCalories < -50) {
    msgs.push(`You're about ${Math.round(Math.abs(remainingCalories))} kcal over today's goal — tomorrow's a fresh start.`);
  }

  const proteinRatio = targets.proteinG > 0 ? totals.proteinG / targets.proteinG : 1;
  if (hour >= 14 && proteinRatio < 0.5) {
    msgs.push(`You're low on protein today — about ${Math.round(targets.proteinG - totals.proteinG)}g left to reach your target.`);
  }

  const carbsRatio = targets.carbsG > 0 ? totals.carbsG / targets.carbsG : 1;
  if (hour >= 18 && carbsRatio < 0.4 && proteinRatio >= 0.5) {
    msgs.push('Your carb intake is on the lower side today — that may be worth noting if you have an evening workout.');
  }

  return msgs.slice(0, 2);
}
