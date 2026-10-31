import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getStartingFoods } from '@/features/add-food/server';
import { RecipeEditor } from '@/features/recipes/components/recipe-editor';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';

export const metadata: Metadata = { title: es.recipes.editor.titleNewRecipe };

export default async function NewRecipePage({ searchParams }: PageProps<'/recipes/new'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const { kind } = await searchParams;
  const starting = await getStartingFoods(current.userId);
  return (
    <RecipeEditor
      recipe={null}
      kind={kind === 'combo' ? 'combo' : 'recipe'}
      favorites={starting.favorites}
      recents={starting.recents}
    />
  );
}
