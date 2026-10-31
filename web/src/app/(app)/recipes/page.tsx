import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ImportSheet } from '@/features/recipes/components/import-sheet';
import { getRecipeList } from '@/features/recipes/server';
import type { RecipeSummary } from '@/features/recipes/types';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';

export const metadata: Metadata = { title: es.recipes.title };

const r = es.recipes;

function describe(recipe: RecipeSummary): string {
  const items =
    recipe.itemCount === 1 ? r.list.itemsOne : t(r.list.items, { count: recipe.itemCount });
  const kcal =
    recipe.kind === 'combo'
      ? t(r.list.comboTotal, { kcal: formatNumber(recipe.kcal, 0) })
      : t(r.list.perServing, { kcal: formatNumber(recipe.kcal, 0) });
  const servings =
    recipe.kind === 'recipe'
      ? recipe.servings === 1
        ? r.list.servingsOne
        : t(r.list.servings, { servings: formatNumber(recipe.servings, 2) })
      : null;
  return [servings, kcal, items].filter(Boolean).join(' · ');
}

function Section({
  title,
  empty,
  recipes,
}: {
  title: string;
  empty: string;
  recipes: RecipeSummary[];
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {recipes.length === 0 ? (
        <p className="text-muted text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="hover:bg-surface-muted flex min-h-14 flex-col justify-center rounded-lg px-2 py-2"
              >
                <span className="font-medium">{recipe.name}</span>
                <span className="text-muted text-sm tabular-nums">{describe(recipe)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function RecipesPage() {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const recipes = await getRecipeList(current.userId);
  if (!recipes) {
    return (
      <p role="alert" className="text-danger">
        {r.errors.generic}
      </p>
    );
  }

  const linkClass =
    'bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{r.title}</h1>
        <p className="text-muted text-sm">{r.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/recipes/new" className={linkClass}>
          {r.new.recipe}
        </Link>
        <Link href="/recipes/new?kind=combo" className={linkClass}>
          {r.new.combo}
        </Link>
        <ImportSheet />
      </div>
      <Section
        title={r.sections.recipes}
        empty={r.list.emptyRecipes}
        recipes={recipes.filter((x) => x.kind === 'recipe')}
      />
      <Section
        title={r.sections.combos}
        empty={r.list.emptyCombos}
        recipes={recipes.filter((x) => x.kind === 'combo')}
      />
    </div>
  );
}
