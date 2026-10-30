import { es } from '@/lib/i18n/es';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{es.app.name}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{es.app.tagline}</p>
    </main>
  );
}
