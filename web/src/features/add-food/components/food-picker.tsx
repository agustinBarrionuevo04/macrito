'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import type { Food } from '@/types';
import { FoodsApiError, searchFoods } from '../api';
import { FoodRow } from './food-row';

const s = es.addFood.search;

/** Espera tras la última letra antes de buscar. */
export const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

type Props = {
  onSelect: (food: Food) => void;
  favoriteIds: ReadonlySet<string>;
  onToggleFavorite: (food: Food) => void;
  /** Lo que se muestra antes de escribir. */
  favorites: Food[];
  recents: Food[];
  /** Crear un alimento propio, con lo escrito como nombre. */
  onCreate: (name: string) => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; foods: Food[]; degraded: boolean };

/**
 * Buscador de alimentos. Sin texto muestra favoritos y recientes; con 2 o más letras busca (con
 * espera de 300 ms y cancelando la búsqueda anterior para que una respuesta lenta no pise a una nueva).
 */
export function FoodPicker({
  onSelect,
  favoriteIds,
  onToggleFavorite,
  favorites,
  recents,
  onCreate,
}: Props) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [retry, setRetry] = useState(0);
  const latest = useRef(0);

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const id = ++latest.current;
    const timer = setTimeout(() => {
      setStatus({ kind: 'loading' });
      searchFoods(trimmed, controller.signal).then(
        (result) => {
          if (id === latest.current) setStatus({ kind: 'done', ...result });
        },
        (error: unknown) => {
          if (controller.signal.aborted || id !== latest.current) return;
          setStatus({
            kind: 'error',
            message: error instanceof FoodsApiError ? error.message : s.errors.generic,
          });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, searching, retry]);

  const rows = (foods: Food[]) => (
    <ul className="flex flex-col">
      {foods.map((food) => (
        <FoodRow
          key={food.id}
          food={food}
          favorite={favoriteIds.has(food.id)}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </ul>
  );

  const section = (title: string, foods: Food[]) =>
    foods.length > 0 ? (
      <section className="flex flex-col gap-1" aria-label={title}>
        <h2 className="text-muted text-sm font-semibold">{title}</h2>
        {rows(foods)}
      </section>
    ) : null;

  let body;
  if (!searching) {
    body =
      favorites.length === 0 && recents.length === 0 ? (
        <p className="text-muted text-sm">{s.emptyList}</p>
      ) : (
        <>
          {section(s.favorites, favorites)}
          {section(s.recents, recents)}
        </>
      );
  } else if (status.kind === 'loading' || status.kind === 'idle') {
    body = (
      <div role="status" aria-label={s.loading} className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (status.kind === 'error') {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-danger text-sm">
          {status.message}
        </p>
        <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
          {es.ui.retry}
        </Button>
      </div>
    );
  } else if (status.foods.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="font-medium">{t(s.noResults, { query: trimmed })}</p>
        <p className="text-muted text-sm">{s.noResultsHelp}</p>
        <Button variant="secondary" onClick={() => onCreate(trimmed)}>
          {t(s.createFromQuery, { query: trimmed })}
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        {status.degraded ? (
          <p role="status" className="bg-surface-muted rounded-lg p-3 text-sm">
            {s.degraded}
          </p>
        ) : null}
        {rows(status.foods)}
        {status.foods.some((food) => food.source === 'ar_seed') ? (
          <p className="text-muted text-xs">{es.foods.attribution.argenfoods}</p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {s.label}
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          placeholder={s.placeholder}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => {
            setQuery(event.target.value);
            setStatus({ kind: 'idle' });
          }}
          className="bg-surface border-border focus:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        />
        {trimmed.length > 0 && !searching ? <p className="text-muted text-sm">{s.hint}</p> : null}
      </div>
      {body}
    </div>
  );
}
