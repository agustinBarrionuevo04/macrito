import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { GoalSummary } from '@/features/profile/components/goal-summary';
import { ProfileEditor } from '@/features/profile/components/profile-editor';
import { WeightForm } from '@/features/profile/components/weight-form';
import type { ProfileDraft } from '@/features/profile/draft';
import { presetOf } from '@/features/profile/mapping';
import { getCurrentProfile, getRecentWeights } from '@/features/profile/server';
import { NutritionInputError, calcTargets, todayInTimeZone } from '@/lib/nutrition';
import { es } from '@/lib/i18n/es';
import { formatIsoDate } from '@/lib/ui/format-date';
import { formatNumber } from '@/lib/ui/number';

export const metadata: Metadata = { title: es.profile.page.title };

const page = es.profile.page;

export default async function ProfilePage() {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');
  const { profile } = current;

  const today = todayInTimeZone(profile.timezone);
  const weights = await getRecentWeights(current.userId);

  // Los datos ya se validaron al guardarlos; si igual fallara el cálculo, el resto del perfil sigue usable.
  let breakdown = null;
  try {
    breakdown = calcTargets(profile, { today });
  } catch (error) {
    if (!(error instanceof NutritionInputError)) throw error;
  }

  const preset = presetOf(profile);
  const initial: ProfileDraft = {
    displayName: profile.displayName ?? '',
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    weeklyGoalKg: profile.weeklyGoalKg ?? null,
    targetWeightKg: profile.targetWeightKg ?? null,
    macroPreset: preset === 'custom' ? 'keep' : preset,
  };

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-bold">{page.title}</h1>
      {current.email ? <p className="text-muted -mt-8 text-sm">{current.email}</p> : null}

      <section aria-labelledby="target-title" className="flex flex-col gap-4">
        <h2 id="target-title" className="text-lg font-semibold">
          {page.targetTitle}
        </h2>
        {breakdown ? (
          <GoalSummary breakdown={breakdown} />
        ) : (
          <p role="alert" className="text-danger">
            {es.profile.errors.generic}
          </p>
        )}
      </section>

      <section aria-labelledby="weight-title" className="flex flex-col gap-4">
        <h2 id="weight-title" className="text-lg font-semibold">
          {page.weightTitle}
        </h2>
        <WeightForm currentWeightKg={profile.weightKg} />
        {weights.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-muted text-sm">{page.weightHistory}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {weights.map((log) => (
                <li key={log.loggedOn} className="flex justify-between tabular-nums">
                  <span>{formatIsoDate(log.loggedOn)}</span>
                  <span>{formatNumber(log.weightKg, 1)} kg</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="data-title" className="flex flex-col gap-4">
        <h2 id="data-title" className="text-lg font-semibold">
          {page.dataTitle}
        </h2>
        <ProfileEditor initial={initial} today={today} />
      </section>

      <section aria-labelledby="appearance-title" className="flex flex-col gap-3">
        <h2 id="appearance-title" className="text-lg font-semibold">
          {page.appearanceTitle}
        </h2>
        <ThemeToggle className="self-start" />
      </section>

      <section aria-labelledby="account-title" className="flex flex-col gap-3">
        <h2 id="account-title" className="text-lg font-semibold">
          {page.accountTitle}
        </h2>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            {es.auth.signOut}
          </Button>
        </form>
      </section>

      <section aria-labelledby="about-title" className="text-muted flex flex-col gap-2 text-sm">
        <h2 id="about-title" className="text-foreground text-lg font-semibold">
          {page.aboutTitle}
        </h2>
        <p>{es.profile.disclaimer}</p>
        <p>{es.foods.attribution.argenfoods}</p>
      </section>
    </div>
  );
}
