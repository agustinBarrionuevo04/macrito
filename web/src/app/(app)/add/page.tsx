import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { dayLabel, resolveDay } from '@/features/diary/dates';
import { isMealType } from '@/features/diary/meal';
import { AddFoodView } from '@/features/add-food/components/add-food-view';
import { getStartingFoods } from '@/features/add-food/server';
import { getRecipeList, getRepeatCounts } from '@/features/recipes/server';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { todayInTimeZone } from '@/lib/nutrition';

export const metadata: Metadata = { title: es.addFood.title };

export default async function AddFoodPage({ searchParams }: PageProps<'/add'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const params = await searchParams;
  const one = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;
  const today = todayInTimeZone(current.profile.timezone);
  const day = resolveDay(one(params.date), today);
  const requestedMeal = one(params.meal);
  const meal = isMealType(requestedMeal) ? requestedMeal : null;

  const label = dayLabel(day, today);
  const dayText = label.kind === 'date' ? label.text : es.diary.day[label.kind];
  const [starting, recipes, repeat] = await Promise.all([
    getStartingFoods(current.userId),
    getRecipeList(current.userId),
    getRepeatCounts(current.userId, day),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{es.addFood.title}</h1>
        <p className="text-muted text-sm">
          {meal ? `${t(es.addFood.forMeal, { meal: es.diary.meals[meal].toLowerCase() })} · ` : ''}
          <span className="first-letter:uppercase">{dayText}</span>
        </p>
      </header>
      <AddFoodView
        day={day}
        today={today}
        initialMeal={meal}
        favoriteIds={starting.favoriteIds}
        favorites={starting.favorites}
        recents={starting.recents}
        combos={(recipes ?? []).filter((recipe) => recipe.kind === 'combo')}
        repeat={repeat}
      />
    </div>
  );
}
