import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import {
  HIDDEN_INGREDIENT_DEFS,
  hiddenIngredientNutrition,
  type HiddenIngredientType,
  type HiddenIngredientUnit,
} from '@/utils/hiddenIngredients';
import { generateId } from '@/utils/id';
import type { HiddenIngredientEntry } from '@/types';

const TYPES = Object.keys(HIDDEN_INGREDIENT_DEFS) as Exclude<HiddenIngredientType, 'other'>[];
const UNITS: HiddenIngredientUnit[] = ['g', 'tbsp', 'tsp'];

export function AddDetailsPanel({ onAdd, onClose }: { onAdd: (entry: HiddenIngredientEntry) => void; onClose: () => void }) {
  const [type, setType] = useState<Exclude<HiddenIngredientType, 'other'> | 'other'>('oil');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<HiddenIngredientUnit>('tbsp');
  const [otherCalories, setOtherCalories] = useState(50);

  function handleAdd() {
    if (type === 'other') {
      onAdd({
        id: generateId('hidden'),
        label: 'Other',
        emoji: '➕',
        nutrition: { calories: Math.round(otherCalories), proteinG: 0, carbsG: 0, fatG: 0 },
      });
    } else {
      const def = HIDDEN_INGREDIENT_DEFS[type];
      onAdd({
        id: generateId('hidden'),
        label: `${def.label} ${amount}${unit}`,
        emoji: def.emoji,
        nutrition: hiddenIngredientNutrition(type, amount, unit),
      });
    }
    onClose();
  }

  return (
    <div className="mt-3 rounded-xl bg-surface-alt p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-fg">What did you add that the AI can&apos;t see?</p>
        <button onClick={onClose} aria-label="Close" className="text-faint hover:text-muted">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <Chip key={t} selected={type === t} onClick={() => setType(t)}>
            {HIDDEN_INGREDIENT_DEFS[t].emoji} {HIDDEN_INGREDIENT_DEFS[t].label}
          </Chip>
        ))}
        <Chip selected={type === 'other'} onClick={() => setType('other')}>
          ➕ Other
        </Chip>
      </div>

      {type === 'other' ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted">~</span>
          <input
            type="number"
            value={otherCalories}
            onChange={(e) => setOtherCalories(Number(e.target.value) || 0)}
            className="input w-24"
          />
          <span className="text-xs text-muted">kcal</span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            step="0.5"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="input w-20"
          />
          <div className="flex gap-1">
            {UNITS.map((u) => (
              <Chip key={u} selected={unit === u} onClick={() => setUnit(u)}>
                {u}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={handleAdd}>
        Add to estimate
      </Button>
    </div>
  );
}
