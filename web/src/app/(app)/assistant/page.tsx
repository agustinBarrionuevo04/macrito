import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { remainingFor } from '@/features/assistant/remaining';
import { AssistantView } from '@/features/assistant/components/assistant-view';
import { resolveDay } from '@/features/diary/dates';
import { isMealType } from '@/features/diary/meal';
import { getDayEntries } from '@/features/diary/server';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';
import { NutritionInputError, computeTargets, todayInTimeZone } from '@/lib/nutrition';

export const metadata: Metadata = { title: es.assistant.title };

export default async function AssistantPage({ searchParams }: PageProps<'/assistant'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const { date, meal } = await searchParams;
  const today = todayInTimeZone(current.profile.timezone);
  const day = resolveDay(typeof date === 'string' ? date : undefined, today);

  let targets;
  try {
    targets = computeTargets(current.profile, { today: day });
  } catch (error) {
    if (error instanceof NutritionInputError) redirect('/profile');
    throw error;
  }
  const entries = await getDayEntries(current.userId, day);
  if (!entries) {
    return (
      <p role="alert" className="text-danger">
        {es.assistant.errors.generic}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{es.assistant.title}</h1>
      <AssistantView
        day={day}
        today={today}
        initialMeal={isMealType(meal) ? meal : 'dinner'}
        initialRemaining={remainingFor(targets, entries)}
      />
    </div>
  );
}
