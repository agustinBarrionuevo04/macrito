import type { Metadata } from 'next';
import { es } from '@/lib/i18n/es';
import './globals.css';

export const metadata: Metadata = {
  title: es.app.name,
  description: es.app.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
