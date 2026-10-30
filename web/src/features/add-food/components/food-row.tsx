import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { Food } from '@/types';

const m = es.addFood.food;

type Props = {
  food: Food;
  favorite: boolean;
  onSelect: (food: Food) => void;
  onToggleFavorite: (food: Food) => void;
};

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
    </svg>
  );
}

/** Un alimento de la lista: tocarlo lo elige; la estrella lo marca como favorito. */
export function FoodRow({ food, favorite, onSelect, onToggleFavorite }: Props) {
  const badge =
    food.source === 'custom' ? m.own : food.source === 'ai_unverified' ? m.unverified : null;

  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={() => onSelect(food)}
        aria-label={t(m.select, { name: food.name })}
        className="hover:bg-surface-muted flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{food.name}</span>
          {badge ? (
            <span className="bg-surface-muted text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-muted truncate text-sm">
          {food.brand ? `${food.brand} · ` : ''}
          {t(m.per100, { kcal: formatNumber(food.per100g.kcal, 0) })}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={t(favorite ? m.favoriteRemove : m.favoriteAdd, { name: food.name })}
        onClick={() => onToggleFavorite(food)}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg ${favorite ? 'text-carbs' : 'text-muted'}`}
      >
        <Star filled={favorite} />
      </button>
    </li>
  );
}
