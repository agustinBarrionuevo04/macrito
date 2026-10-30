import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DayPager } from '@/features/diary/components/day-pager';
import { DiarySkeleton } from '@/features/diary/components/diary-skeleton';
import { DiaryView } from '@/features/diary/components/diary-view';
import { resolveDay } from '@/features/diary/dates';
import { getDayEntries } from '@/features/diary/server';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';
import { NutritionInputError, computeTargets, todayInTimeZone } from '@/lib/nutrition';
import type { DailyTargets, UserProfile } from '@/types';

export const metadata: Metadata = { title: es.diary.title };

function targetsOf(profile: UserProfile, today: string): DailyTargets | null {
  try {
    return computeTargets(profile, { today });
  } catch (error) {
    // Los datos ya se validaron al guardarlos; si igual fallara, el diario sigue siendo usable.
    if (error instanceof NutritionInputError) return null;
    throw error;
  }
}

async function DayContent({
  userId,
  day,
  today,
  targets,
}: {
  userId: string;
  day: string;
  today: string;
  targets: DailyTargets | null;
}) {
  const entries = await getDayEntries(userId, day);
  if (!entries) {
    return (
      <p role="alert" className="text-danger">
        {es.diary.errors.generic}
      </p>
    );
  }
  return <DiaryView day={day} today={today} entries={entries} targets={targets} />;
}

export default async function TodayPage({ searchParams }: PageProps<'/'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const { date } = await searchParams;
  const today = todayInTimeZone(current.profile.timezone);
  const day = resolveDay(typeof date === 'string' ? date : undefined, today);

  return (
    <DayPager day={day} today={today}>
      <Suspense key={day} fallback={<DiarySkeleton />}>
        <DayContent
          userId={current.userId}
          day={day}
          today={today}
          targets={targetsOf(current.profile, today)}
        />
      </Suspense>
    </DayPager>
  );
}
