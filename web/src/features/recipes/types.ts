export type RecipeKind = 'recipe' | 'combo';

/** Un ingrediente con su snapshot por 100 g (editar el alimento original no cambia la receta). */
export type Ingredient = {
  /** Alimento de origen, si se eligió de la base; `null` en recetas importadas. */
  foodId: string | null;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

export type RecipeSummary = {
  id: string;
  kind: RecipeKind;
  name: string;
  servings: number;
  finalWeightG: number | null;
  foodId: string | null;
  itemCount: number;
  /** kcal por porción (recetas) o del combo entero. */
  kcal: number;
};

export type RecipeDetail = {
  id: string;
  kind: RecipeKind;
  name: string;
  servings: number;
  finalWeightG: number | null;
  foodId: string | null;
  items: Ingredient[];
};
