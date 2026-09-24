import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Chip } from '@/components/ui/Chip';
import { FoodTagPicker } from '@/components/nutrition/FoodTagPicker';
import type { DietaryRestriction, UserProfile } from '@/types';

const RESTRICTION_OPTIONS: { value: DietaryRestriction; label: string }[] = [
  { value: 'vegetarian', label: '🥦 Vegetarian' },
  { value: 'vegan', label: '🌱 Vegan' },
  { value: 'gluten_free', label: '🌾 Gluten-free' },
  { value: 'dairy_free', label: '🥛 Dairy-free' },
];

export function NutritionPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile) as UserProfile;
  const updateProfile = useAppStore((s) => s.updateProfile);

  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>(profile.dietaryRestrictions ?? []);
  const [allergyNotes, setAllergyNotes] = useState(profile.allergyNotes ?? '');
  const [liked, setLiked] = useState<string[]>(profile.likedFoodIds ?? []);
  const [disliked, setDisliked] = useState<string[]>(profile.dislikedFoodIds ?? []);
  const [saved, setSaved] = useState(false);

  function toggleRestriction(r: DietaryRestriction) {
    setRestrictions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
    setSaved(false);
  }

  function save() {
    updateProfile({
      dietaryRestrictions: restrictions,
      allergyNotes: allergyNotes.trim() || undefined,
      likedFoodIds: liked,
      dislikedFoodIds: disliked,
    });
    setSaved(true);
  }

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">My Nutrition</h1>
        <p className="mt-1 text-sm text-muted">
          Tell us what you need to eat — every AI feature in this app (meal plans, "what should I eat", recommendations) uses this.
        </p>
      </header>

      <section className="rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-sm font-bold text-fg">Dietary restrictions</h2>
        <div className="flex flex-wrap gap-2">
          {RESTRICTION_OPTIONS.map((o) => (
            <Chip key={o.value} selected={restrictions.includes(o.value)} onClick={() => toggleRestriction(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="mb-1 text-sm font-bold text-fg">Allergies & notes</h2>
        <p className="mb-2 text-xs text-muted">
          Free text for the AI Coach to keep in mind — this isn't checked against ingredients automatically, so always double-check
          anything serious yourself.
        </p>
        <textarea
          value={allergyNotes}
          onChange={(e) => {
            setAllergyNotes(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. allergic to peanuts, avoid spicy food"
          rows={3}
          className="input resize-none"
        />
      </section>

      <section className="rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="mb-1 text-sm font-bold text-fg">Foods you like</h2>
        <p className="mb-2 text-xs text-muted">The AI leans toward these when it can.</p>
        <FoodTagPicker
          selectedIds={liked}
          onChange={(ids) => {
            setLiked(ids);
            setSaved(false);
          }}
          tone="like"
          placeholder="Search a food you like…"
        />
      </section>

      <section className="rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="mb-1 text-sm font-bold text-fg">Foods you avoid</h2>
        <p className="mb-2 text-xs text-muted">The AI never suggests these in meal plans or recommendations.</p>
        <FoodTagPicker
          selectedIds={disliked}
          onChange={(ids) => {
            setDisliked(ids);
            setSaved(false);
          }}
          tone="avoid"
          placeholder="Search a food to avoid…"
        />
      </section>

      <button
        onClick={save}
        className={`w-full rounded-xl py-3 text-sm font-semibold transition ${
          saved ? 'bg-primary-500 text-white' : 'bg-primary-500 text-white hover:bg-primary-600 active:scale-[0.98]'
        }`}
      >
        {saved ? 'Saved ✓' : 'Save my nutrition preferences'}
      </button>

      <section className="rounded-xl2 bg-gradient-to-br from-primary-500 to-primary-600 p-5 text-white shadow-elevated">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Sparkles size={16} /> Let AI build your plan
        </div>
        <p className="mt-1.5 text-sm text-primary-50">
          Whenever you want, ask the AI to generate a meal plan using your targets and everything above — you can still replace or
          regenerate any meal afterward.
        </p>
        <button
          onClick={() => navigate('/coach?view=plan')}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
        >
          Ask AI to build my plan
          <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
}
