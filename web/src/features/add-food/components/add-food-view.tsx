'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AiAnalyzer } from '@/features/ai-photo/components/ai-analyzer';
import { addEntry } from '@/features/diary/actions';
import { defaultMealFor } from '@/features/diary/meal';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { cx } from '@/lib/ui/cx';
import type { EntryDraft, Food, MealType, Origin } from '@/types';
import { lookupBarcode, FoodsApiError } from '../api';
import { setFavorite } from '../actions';
import { BarcodeScanner } from './barcode-scanner';
import {
  CustomFoodForm,
  emptyValues,
  valuesFromFood,
  type CustomFoodMode,
} from './custom-food-form';
import { FoodPicker } from './food-picker';
import { PortionSheet } from './portion-sheet';

const a = es.addFood;

type Tab = 'search' | 'scan' | 'photo' | 'text' | 'custom';

type Props = {
  /** Día al que se agrega (`AAAA-MM-DD`) y si es hoy (para volver al diario). */
  day: string;
  today: string;
  /** Comida elegida en la URL; si falta, se sugiere según la hora al abrir la cantidad. */
  initialMeal: MealType | null;
  favoriteIds: string[];
  favorites: Food[];
  recents: Food[];
};

type Selection = { food: Food; origin: Origin; meal: MealType };

type ScanState =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'not-found'; code: string }
  | { kind: 'error'; message: string };

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: a.tabs.search },
  { id: 'scan', label: a.tabs.scan },
  { id: 'photo', label: es.aiFood.tabs.photo },
  { id: 'text', label: es.aiFood.tabs.text },
  { id: 'custom', label: a.tabs.custom },
];

/** Pantalla de agregar: buscar, escanear o crear un alimento; después elegir cuánto y a qué comida. */
export function AddFoodView({ day, today, initialMeal, favoriteIds, favorites, recents }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('search');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [form, setForm] = useState<CustomFoodMode | null>(null);
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
  const [favIds, setFavIds] = useState(() => new Set(favoriteIds));
  const [favFoods, setFavFoods] = useState(favorites);
  const lookupController = useRef<AbortController | null>(null);

  const choose = useCallback(
    (food: Food, origin: Origin) =>
      setSelection({ food, origin, meal: initialMeal ?? defaultMealFor(new Date()) }),
    [initialMeal],
  );

  async function toggleFavorite(food: Food) {
    const next = !favIds.has(food.id);
    const apply = (on: boolean) => {
      setFavIds((current) => {
        const copy = new Set(current);
        if (on) copy.add(food.id);
        else copy.delete(food.id);
        return copy;
      });
      setFavFoods((current) => {
        const without = current.filter((f) => f.id !== food.id);
        return on ? [...without, food].sort((x, y) => x.name.localeCompare(y.name, 'es')) : without;
      });
    };
    apply(next);
    const result = await setFavorite(food.id, next);
    if (!result.ok) {
      apply(!next);
      toast.show({ message: a.food.favoriteError, tone: 'error' });
    }
  }

  const onCode = useCallback(
    async (code: string) => {
      lookupController.current?.abort();
      const controller = new AbortController();
      lookupController.current = controller;
      setScan({ kind: 'looking' });
      try {
        const food = await lookupBarcode(code, controller.signal);
        if (controller.signal.aborted) return;
        if (food) {
          setScan({ kind: 'idle' });
          choose(food, 'barcode');
        } else {
          setScan({ kind: 'not-found', code });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setScan({
          kind: 'error',
          message: error instanceof FoodsApiError ? error.message : a.scan.errors.generic,
        });
      }
    },
    [choose],
  );

  const viewDiary = () => router.push(day === today ? '/' : `/?date=${day}`);

  const renderPicker = (onSelect: (food: Food) => void) => (
    <FoodPicker
      onSelect={onSelect}
      favoriteIds={favIds}
      onToggleFavorite={toggleFavorite}
      favorites={favFoods}
      recents={recents.filter((food) => !favIds.has(food.id))}
      onCreate={(name) => setForm({ kind: 'create', values: emptyValues({ name }) })}
    />
  );

  async function confirm(draft: EntryDraft) {
    const result = await addEntry(draft, day);
    if (result.ok) {
      toast.show({
        message: t(a.portion.added, { meal: es.diary.meals[draft.meal_type].toLowerCase() }),
        tone: 'success',
        action: {
          label: a.portion.view,
          onClick: viewDiary,
        },
      });
    }
    return result;
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={a.title}
        className="bg-surface-muted grid grid-cols-5 gap-1 rounded-xl p-1"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={cx(
              'min-h-11 rounded-lg px-1 text-xs font-medium',
              tab === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'search' ? (
          <FoodPicker
            onSelect={(food) => choose(food, 'search')}
            favoriteIds={favIds}
            onToggleFavorite={toggleFavorite}
            favorites={favFoods}
            recents={recents.filter((food) => !favIds.has(food.id))}
            onCreate={(name) => setForm({ kind: 'create', values: emptyValues({ name }) })}
          />
        ) : null}

        {tab === 'scan' ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{a.scan.title}</h2>
            <BarcodeScanner onCode={onCode} busy={scan.kind === 'looking'} />
            {scan.kind === 'looking' ? (
              <p role="status" className="text-muted text-sm">
                {a.scan.looking}
              </p>
            ) : null}
            {scan.kind === 'error' ? (
              <p role="alert" className="text-danger text-sm">
                {scan.message}
              </p>
            ) : null}
            {scan.kind === 'not-found' ? (
              <div role="status" className="bg-surface-muted flex flex-col gap-2 rounded-lg p-3">
                <p className="font-semibold">{a.scan.notFound}</p>
                <p className="text-muted text-sm">{a.scan.notFoundHelp}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setForm({ kind: 'create', values: emptyValues({ barcode: scan.code }) })
                  }
                >
                  {a.scan.createWithCode}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'photo' || tab === 'text' ? (
          <AiAnalyzer
            key={tab}
            mode={tab}
            initialMeal={initialMeal}
            renderPicker={renderPicker}
            onAdd={(draft) => addEntry(draft, day)}
            onViewDiary={viewDiary}
          />
        ) : null}

        {tab === 'custom' ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted text-sm">{a.custom.help}</p>
            <Button onClick={() => setForm({ kind: 'create', values: emptyValues() })}>
              {a.custom.createTitle}
            </Button>
          </div>
        ) : null}
      </div>

      <PortionSheet
        food={selection?.food ?? null}
        origin={selection?.origin ?? 'search'}
        defaultMeal={selection?.meal ?? 'lunch'}
        onClose={() => setSelection(null)}
        onConfirm={confirm}
        onEdit={(food) => setForm({ kind: 'edit', foodId: food.id, values: valuesFromFood(food) })}
        onCorrect={(food) => setForm({ kind: 'correct', values: valuesFromFood(food) })}
      />
      <CustomFoodForm
        mode={form}
        onClose={() => setForm(null)}
        onSaved={(food) => {
          setForm(null);
          toast.show({ message: a.custom.saved, tone: 'success' });
          choose(food, 'manual');
        }}
      />
    </div>
  );
}
