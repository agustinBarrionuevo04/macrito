import Link from 'next/link';
import { es } from '@/lib/i18n/es';
import { signIn } from '../actions';
import { AuthForm } from '../_components/auth-form';

export default function LoginPage() {
  const t = es.auth;
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.login.title}</h1>
      <AuthForm
        action={signIn}
        submitLabel={t.login.submit}
        fields={[
          { name: 'email', type: 'email', label: t.fields.email, autoComplete: 'email' },
          {
            name: 'password',
            type: 'password',
            label: t.fields.password,
            autoComplete: 'current-password',
          },
        ]}
      />
      <nav className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="underline">
          {t.login.forgotLink}
        </Link>
        <Link href="/register" className="underline">
          {t.login.registerLink}
        </Link>
      </nav>
    </>
  );
}
