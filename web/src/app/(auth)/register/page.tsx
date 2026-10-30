import Link from 'next/link';
import { es } from '@/lib/i18n/es';
import { signUp } from '../actions';
import { AuthForm } from '../_components/auth-form';

export default function RegisterPage() {
  const t = es.auth;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t.register.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.register.subtitle}</p>
      </div>
      <AuthForm
        action={signUp}
        submitLabel={t.register.submit}
        fields={[
          { name: 'email', type: 'email', label: t.fields.email, autoComplete: 'email' },
          {
            name: 'password',
            type: 'password',
            label: t.fields.password,
            autoComplete: 'new-password',
          },
          {
            name: 'confirmPassword',
            type: 'password',
            label: t.fields.confirmPassword,
            autoComplete: 'new-password',
          },
        ]}
      />
      <Link href="/login" className="text-sm underline">
        {t.register.loginLink}
      </Link>
    </>
  );
}
