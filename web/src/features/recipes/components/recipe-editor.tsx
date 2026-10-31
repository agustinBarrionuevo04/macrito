'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { FoodPicker } from '@/features/add-food/components/food-picker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { Food } from '@/types';
import { deleteRecipe, duplicateRecipe, saveRecipe } from '../actions';
import { exportRecipe } from '../exchange';
import { ingredientMacros, recipeNutrition } from '../nutrition';
import { MAX_INGREDIENTS } from '../schemas';
import type { Ingredient, RecipeDetail, RecipeKind } from '../types';

const ed = es.recipes.editor;

type Props = {
  /** `null` = receta nueva. */
  recipe: RecipeDetail | null;
  kind: RecipeKind;
  /** Favoritos y recientes para el selector de ingredientes. */
  favorites: Food[];
  recents: Food[];
};

type Row = Ingredient & { key: string };

let counter = 0;
const withKey = (item: Ingredient): Row => ({ ...item, key: `row-${(counter += 1)}` });

function ingredientFromFood(food: Food): Ingredient {
  return {
    foodId: food.id,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    grams: food.portions[0]?.grams ?? 100,
    kcal_100g: food.per100g.kcal,
    protein_100g: food.per100g.protein_g,
    carbs_100g: food.per100g.carbs_g,
    fat_100g: food.per100g.fat_g,
  };
}

/** Editor de una receta o de una comida frecuente: ingredientes con gramos y los valores en vivo. */
export function RecipeEditor({ recipe, kind, favorites, recents }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState<number | null>(recipe?.servings ?? 1);
  const [finalWeight, setFinalWeight] = useState<number | null>(recipe?.finalWeightG ?? null);
  const [rows, setRows] = useState<Row[]>(() => (recipe?.items ?? []).map(withKey));
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRecipe = kind === 'recipe';
  const nutrition = useMemo(
    () => recipeNutrition(rows, isRecipe ? (servings ?? 1) : 1, isRecipe ? finalWeight : null),
    [rows, servings, finalWeight, isRecipe],
  );

  const title = recipe ? ed.titleEdit : isRecipe ? ed.titleNewRecipe : ed.titleNewCombo;
  const update = (key: string, patch: Partial<Ingredient>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError(null);
  };

  function save() {
    const payload = {
      kind,
      name,
      servings: isRecipe ? servings : 1,
      finalWeightG: isRecipe ? finalWeight : null,
      items: rows.map(({ key: _key, ...item }) => ({ ...item, grams: item.grams })),
    };
    startTransition(async () => {
      const result = await saveRecipe(recipe?.id ?? null, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: ed.saved, tone: 'success' });
      router.push('/recipes');
    });
  }

  function remove() {
    if (!recipe) return;
    startTransition(async () => {
      const result = await deleteRecipe(recipe.id);
      setConfirmDelete(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: ed.deleted, tone: 'success' });
      router.push('/recipes');
    });
  }

  function duplicate() {
    if (!recipe) return;
    startTransition(async () => {
      const result = await duplicateRecipe(recipe.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: ed.duplicated, tone: 'success' });
      router.push(`/recipes/${result.id}`);
    });
  }

  async function copyText() {
    if (!recipe) return;
    try {
      await navigator.clipboard.writeText(exportRecipe({ ...recipe, items: rows }));
      toast.show({ message: ed.copied, tone: 'success' });
    } catch {
      toast.show({ message: ed.copyFailed, tone: 'error' });
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h1 className="text-2xl font-bold">{title}</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-name" className="text-sm font-medium">
          {ed.name}
        </label>
        <input
          id="recipe-name"
          type="text"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        />
      </div>

      {isRecipe ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            label={ed.servings}
            decimals={2}
            value={servings}
            onChange={(v) => {
              setServings(v);
              setError(null);
            }}
          />
          <NumberInput
            label={ed.finalWeight}
            unit="g"
            decimals={1}
            value={finalWeight}
            onChange={(v) => {
              setFinalWeight(v);
              setError(null);
            }}
          />
          <p className="text-muted col-span-2 -mt-1 text-xs">
            {ed.servingsHelp} {ed.finalWeightHelp}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="ingredients-title" className="flex flex-col gap-3">
        <h2 id="ingredients-title" className="text-lg font-semibold">
          {isRecipe ? ed.ingredients : ed.comboItems}
        </h2>
        {rows.length === 0 ? <p className="text-muted text-sm">{ed.empty}</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="border-border flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{row.name}</span>
                <button
                  type="button"
                  aria-label={t(ed.remove, { name: row.name })}
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  className="text-muted -mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="flex items-end gap-3">
                <NumberInput
                  className="w-32 shrink-0"
                  label={t(ed.grams, { name: row.name })}
                  unit="g"
                  decimals={1}
                  value={row.grams > 0 ? row.grams : null}
                  onChange={(grams) => update(row.key, { grams: grams ?? 0 })}
                />
                <p className="text-muted mb-2 min-w-0 flex-1 text-right text-sm tabular-nums">
                  {formatNumber(ingredientMacros(row).kcal, 0)} kcal
                </p>
              </div>
            </li>
          ))}
        </ul>
        {rows.length < MAX_INGREDIENTS ? (
          <Button variant="secondary" onClick={() => setPicking(true)}>
            {isRecipe ? ed.addIngredient : ed.addFood}
          </Button>
        ) : null}
        <p className="text-muted text-xs">{ed.snapshotNote}</p>
      </section>

      {rows.length > 0 ? (
        <section
          aria-label={isRecipe ? ed.summary : ed.summaryCombo}
          className="bg-surface-muted flex flex-col gap-2 rounded-xl p-3 tabular-nums"
          aria-live="polite"
        >
          <p className="text-2xl font-bold">
            {formatNumber(isRecipe ? nutrition.perServing.kcal : nutrition.totals.kcal, 0)}{' '}
            <span className="text-muted text-sm font-normal">
              kcal · {isRecipe ? ed.summary.toLowerCase() : ed.summaryCombo.toLowerCase()}
            </span>
          </p>
          <p className="text-muted text-sm">
            P{' '}
            {formatNumber(
              isRecipe ? nutrition.perServing.protein_g : nutrition.totals.protein_g,
              1,
            )}{' '}
            · C{' '}
            {formatNumber(isRecipe ? nutrition.perServing.carbs_g : nutrition.totals.carbs_g, 1)} ·
            G {formatNumber(isRecipe ? nutrition.perServing.fat_g : nutrition.totals.fat_g, 1)}
          </p>
          {isRecipe ? (
            <p className="text-muted text-xs">
              {t(ed.weight, { grams: formatNumber(nutrition.weightG, 0) })} ·{' '}
              {t(ed.portion, { grams: formatNumber(nutrition.perServing.grams, 0) })} · {ed.per100}:{' '}
              {formatNumber(nutrition.per100g.kcal, 0)} kcal
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {pending ? ed.saving : ed.save}
      </Button>

      {recipe ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={duplicate}>
            {ed.duplicate}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => void copyText()}>
            {ed.copyText}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            className="text-danger"
            onClick={() => setConfirmDelete(true)}
          >
            {ed.delete}
          </Button>
        </div>
      ) : null}

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title={ed.pickerTitle}
        className="max-h-[92dvh] overflow-y-auto"
      >
        {picking ? (
          <FoodPicker
            favoriteIds={new Set(favorites.map((food) => food.id))}
            favorites={favorites}
            recents={recents}
            onSelect={(food) => {
              setRows((current) => [...current, withKey(ingredientFromFood(food))]);
              setPicking(false);
              setError(null);
            }}
          />
        ) : null}
      </Sheet>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={ed.delete}
        description={t(ed.deleteConfirm, { name: recipe?.name ?? '' })}
      >
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>
            {ed.deleteNo}
          </Button>
          <Button variant="danger" className="flex-1" loading={pending} onClick={remove}>
            {ed.deleteYes}
          </Button>
        </div>
      </Dialog>
    </form>
  );
}
