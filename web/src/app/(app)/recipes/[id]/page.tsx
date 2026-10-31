import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getStartingFoods } from '@/features/add-food/server';
import { RecipeEditor } from '@/features/recipes/components/recipe-editor';
import { recipeIdSchema } from '@/features/recipes/schemas';
import { getRecipeDetail } from '@/features/recipes/server';
import { getCurrentProfile } from '@/features/profile/server';
import { es } from '@/lib/i18n/es';

export const metadata: Metadata = { title: es.recipes.editor.titleEdit };

export default async function EditRecipePage({ params }: PageProps<'/recipes/[id]'>) {
  const current = await getCurrentProfile();
  if (!current) redirect('/login');
  if (!current.profile) redirect('/onboarding');

  const { id } = await params;
  if (!recipeIdSchema.safeParse(id).success) notFound();
  const recipe = await getRecipeDetail(current.userId, id);
  if (!recipe) notFound();

  const starting = await getStartingFoods(current.userId);
  return (
    <RecipeEditor
      recipe={recipe}
      kind={recipe.kind}
      favorites={starting.favorites}
      recents={starting.recents}
    />
  );
}
