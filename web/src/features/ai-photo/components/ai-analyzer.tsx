'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { searchFoods } from '@/features/add-food/api';
import { defaultMealFor } from '@/features/diary/meal';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import type { DiaryResult } from '@/features/diary/types';
import type { EntryDraft, Food, MealType } from '@/types';
import { AiApiError, analyzePhoto, analyzeText } from '../api';
import { resizeToJpeg } from '../resize';
import { resolveItems, type ReviewItem } from '../resolve';
import { ReviewScreen } from './review-screen';

const photo = es.aiFood.photo;
const text = es.aiFood.text;

export const MAX_TEXT_LENGTH = 500;

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'review'; items: ReviewItem[]; meal: MealType; run: number };

type Props = {
  mode: 'photo' | 'text';
  initialMeal: MealType | null;
  /** Elegir un alimento para un renglón (el mismo buscador de la pantalla de agregar). */
  renderPicker: (onSelect: (food: Food) => void) => React.ReactNode;
  onAdd: (draft: EntryDraft) => Promise<DiaryResult>;
  onViewDiary: () => void;
};

/** Captura (foto o texto), análisis con IA y pantalla de revisión. */
export function AiAnalyzer({ mode, initialMeal, renderPicker, onAdd, onViewDiary }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const fileId = useId();
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const runs = useRef(0);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (
      label: string,
      analyze: (signal: AbortSignal) => Promise<import('@/types').PhotoItem[]>,
    ) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setError(null);
      setPhase({ kind: 'working', label });
      try {
        const found = await analyze(current.signal);
        const items = await resolveItems(found, (query, signal) => searchFoods(query, signal), {
          signal: current.signal,
        });
        runs.current += 1;
        setPhase({
          kind: 'review',
          items,
          meal: initialMeal ?? defaultMealFor(new Date()),
          run: runs.current,
        });
      } catch (caught) {
        if (current.signal.aborted) return;
        setError(caught instanceof AiApiError ? caught.message : es.aiFood.errors.generic);
        setPhase({ kind: 'idle' });
      }
    },
    [initialMeal],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    await run(photo.preparing, async (signal) => {
      let jpeg: Blob;
      try {
        jpeg = await resizeToJpeg(file);
      } catch {
        throw new AiApiError('unreadable', photo.unreadable);
      }
      setPhase({ kind: 'working', label: photo.analyzing });
      return analyzePhoto(jpeg, signal);
    });
  }

  function submitText() {
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setError(text.tooShort);
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError(t(text.tooLong, { max: MAX_TEXT_LENGTH }));
      return;
    }
    void run(text.analyzing, (signal) => analyzeText(trimmed, signal));
  }

  if (phase.kind === 'review') {
    return (
      <ReviewScreen
        key={phase.run}
        items={phase.items}
        origin={mode === 'photo' ? 'ai_photo' : 'ai_text'}
        defaultMeal={phase.meal}
        renderPicker={renderPicker}
        onAdd={onAdd}
        onDone={() => {
          setInput('');
          setPhase({ kind: 'idle' });
        }}
        onViewDiary={onViewDiary}
        onRetry={() => setPhase({ kind: 'idle' })}
      />
    );
  }

  const working = phase.kind === 'working';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{mode === 'photo' ? photo.title : text.title}</h2>
        <p className="text-muted text-sm">{mode === 'photo' ? photo.help : text.help}</p>
      </div>

      {mode === 'photo' ? (
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={photo.pick}
            tabIndex={-1}
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            size="lg"
            loading={working}
            disabled={working}
            onClick={() => fileRef.current?.click()}
          >
            {working ? phase.label : photo.pick}
          </Button>
          <p className="text-muted text-xs">{photo.privacy}</p>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitText();
          }}
        >
          <label htmlFor={textId} className="text-sm font-medium">
            {text.label}
          </label>
          <textarea
            id={textId}
            rows={3}
            value={input}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={text.placeholder}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            className="bg-surface border-border focus:border-primary rounded-lg border px-3 py-2 text-base outline-none"
          />
          <Button type="submit" size="lg" loading={working} disabled={working}>
            {working ? phase.label : text.submit}
          </Button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
