import type { Metadata, Viewport } from 'next';
import { InstallBanner } from '@/components/pwa/install-banner';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import { ToastProvider } from '@/components/ui/toast';
import { es } from '@/lib/i18n/es';
import { THEME_INIT_SCRIPT } from '@/lib/ui/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: es.app.name, template: `%s · ${es.app.name}` },
  description: es.app.description,
  applicationName: es.app.name,
  appleWebApp: { capable: true, title: es.app.name, statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deja usar el área completa del iPhone; los márgenes se resuelven con env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#047857' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: el script de <head> puede poner data-theme antes de hidratar.
    <html lang="es-AR" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <PwaProvider>
          <ToastProvider>
            <InstallBanner />
            {children}
          </ToastProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
