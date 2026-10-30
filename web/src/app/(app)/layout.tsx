import { BottomNav } from '@/components/ui/bottom-nav';

/** Pantallas de la app con sesión: contenido a ancho de celular y navegación inferior. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-24">{children}</div>
      <BottomNav />
    </>
  );
}
