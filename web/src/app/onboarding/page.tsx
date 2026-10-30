import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/profile/components/onboarding-wizard';
import { getCurrentProfile } from '@/features/profile/server';
import { todayInTimeZone } from '@/lib/nutrition';
import { es } from '@/lib/i18n/es';

export const metadata: Metadata = { title: es.profile.onboarding.welcomeTitle };

/** Se muestra una sola vez, tras el primer ingreso. El proxy también redirige, esto es la segunda barrera. */
export default async function OnboardingPage() {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (current.row.onboarding_completed_at) redirect('/');

  return (
    <OnboardingWizard
      today={todayInTimeZone(current.row.timezone)}
      timezone={current.row.timezone}
    />
  );
}
