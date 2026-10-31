'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { importRecipeText } from '../actions';

const m = es.recipes.import;

/** Importa una receta pegando el texto que dejó "Copiar para compartir". */
export function ImportSheet() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await importRecipeText(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show({ message: m.done, tone: 'success' });
      setOpen(false);
      setText('');
      router.push(`/recipes/${result.id}`);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {m.open}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={m.title} description={m.help}>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="import-text" className="text-sm font-medium">
            {m.label}
          </label>
          <textarea
            id="import-text"
            rows={6}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            className="bg-surface border-border focus:border-primary rounded-lg border px-3 py-2 font-mono text-sm outline-none"
          />
          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" loading={pending}>
            {m.submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
