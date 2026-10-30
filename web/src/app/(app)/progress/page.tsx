import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MacroBar } from '@/components/ui/macro-bar';
import { CaloriesChart } from '@/features/progress/components/calories-chart';
import { RangeTabs } from '@/features/progress/components/range-tabs';
import { StatTile } from '@/features/progress/components/stat-tile';
import { WeeksTable } from '@/features/progress/components/weeks-table';
import { WeightChart } from '@/features/progress/components/weight-chart';
import { parseRange } from '@/features/progress/range';
import { getProgressData } from '@/features/progress/server';
import { buildProgressView } from '@/features/progress/view';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { NutritionInputError, computeTargets, todayInTimeZone } from '@/lib/nutrition';
import { formatNumber } from '@/lib/ui/number';

export const metadata: Metadata = { title: es.progress.title };

const p = es.progress;

function signed(value: number): string {
  const text = formatNumber(Math.abs(value), 1);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

export default async function ProgressPage({ searchParams }: PageProps<'/progress'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const { range: requested } = await searchParams;
  const range = parseRange(typeof requested === 'string' ? requested : undefined);
  const today = todayInTimeZone(current.profile.timezone);

  let target = null;
  try {
    target = computeTargets(current.profile, { today });
  } catch (error) {
    if (!(error instanceof NutritionInputError)) throw error;
  }

  const data = await getProgressData(current.userId, today);
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <p role="alert" className="text-danger">
          {p.errors.load}
        </p>
      </div>
    );
  }

  const view = buildProgressView({
    today,
    range,
    totals: data.totals,
    weights: data.weights,
    target,
  });
  const { summary, streak, weight } = view;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{p.title}</h1>
      <RangeTabs current={range} />

      {!view.hasMeals && weight.readings.length === 0 ? (
        <div className="bg-surface-muted flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
          <p className="font-semibold">{p.empty.title}</p>
          <p className="text-muted text-sm">{p.empty.text}</p>
          <Link
            href="/add"
            className="bg-primary text-primary-foreground mt-2 inline-flex min-h-11 items-center rounded-lg px-4 font-medium"
          >
            {p.empty.action}
          </Link>
        </div>
      ) : (
        <>
          <section aria-label={p.title} className="grid grid-cols-2 gap-3">
            <StatTile
              label={p.kpi.streak}
              value={
                streak.capped
                  ? t(p.kpi.streakCapped, { days: streak.days })
                  : t(streak.days === 1 ? p.kpi.streakOne : p.kpi.streakMany, { days: streak.days })
              }
              hint={p.kpi.streakHint}
            />
            <StatTile
              label={p.kpi.adherence}
              value={
                summary.adherencePct === null
                  ? p.kpi.none
                  : t(p.kpi.adherenceValue, { pct: summary.adherencePct })
              }
              hint={p.kpi.adherenceHint}
            />
            <StatTile
              label={p.kpi.average}
              value={
                summary.avg
                  ? t(p.kpi.averageValue, { kcal: formatNumber(summary.avg.kcal, 0) })
                  : p.kpi.none
              }
              hint={p.kpi.averageHint}
            />
            <StatTile
              label={p.kpi.logged}
              value={t(p.kpi.loggedValue, { logged: summary.loggedDays, total: summary.totalDays })}
            />
          </section>

          <section aria-labelledby="weight-title" className="flex flex-col gap-3">
            <h2 id="weight-title" className="text-lg font-semibold">
              {p.weight.title}
            </h2>
            {weight.readings.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted text-sm">{p.weight.empty}</p>
                <Link
                  href="/profile"
                  className="text-primary inline-flex min-h-11 items-center text-sm font-medium"
                >
                  {p.weight.goProfile}
                </Link>
              </div>
            ) : (
              <>
                {weight.change ? (
                  <p className="text-sm tabular-nums">
                    <span className="text-muted">{p.weight.change}: </span>
                    <span className="font-semibold">
                      {t(p.weight.changeValue, { kg: signed(weight.change.deltaKg) })}
                    </span>
                    {weight.change.perWeekKg !== null ? (
                      <span className="text-muted">
                        {' · '}
                        {t(p.weight.perWeek, { kg: signed(weight.change.perWeekKg) })}
                      </span>
                    ) : null}
                  </p>
                ) : weight.readings.length === 1 ? (
                  <p className="text-muted text-sm">{p.weight.emptyOne}</p>
                ) : null}
                <WeightChart days={view.days} readings={weight.readings} average={weight.average} />
              </>
            )}
          </section>

          <section aria-labelledby="calories-title" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="calories-title" className="text-lg font-semibold">
                {p.calories.title}
              </h2>
              <p className="text-muted text-sm">
                {view.weeklyBars ? p.calories.subtitleWeekly : p.calories.subtitle}
              </p>
            </div>
            <CaloriesChart
              bars={view.bars}
              target={target?.kcal ?? null}
              weekly={view.weeklyBars}
            />
          </section>

          <section aria-labelledby="macros-title" className="flex flex-col gap-4">
            <h2 id="macros-title" className="text-lg font-semibold">
              {p.macros.title}
            </h2>
            {summary.avg && target ? (
              <div className="flex flex-col gap-3">
                <p className="text-muted text-sm">{p.macros.averageTitle}</p>
                <MacroBar
                  label={p.macros.protein}
                  value={summary.avg.protein_g}
                  target={target.protein_g}
                  kind="protein"
                />
                <MacroBar
                  label={p.macros.carbs}
                  value={summary.avg.carbs_g}
                  target={target.carbs_g}
                  kind="carbs"
                />
                <MacroBar
                  label={p.macros.fat}
                  value={summary.avg.fat_g}
                  target={target.fat_g}
                  kind="fat"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <h3 className="text-muted text-sm">{p.macros.weeksTitle}</h3>
              <WeeksTable rows={view.weeks} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
