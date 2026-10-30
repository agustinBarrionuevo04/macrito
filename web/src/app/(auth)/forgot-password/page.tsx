import Link from 'next/link';
import { es } from '@/lib/i18n/es';
import { requestPasswordReset } from '../actions';
import { AuthForm } from '../_components/auth-form';

export default function ForgotPasswordPage() {
  const t = es.auth;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t.forgotPassword.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.forgotPassword.subtitle}</p>
      </div>
      <AuthForm
        action={requestPasswordReset}
        submitLabel={t.forgotPassword.submit}
        fields={[{ name: 'email', type: 'email', label: t.fields.email, autoComplete: 'email' }]}
      />
      <Link href="/login" className="text-sm underline">
        {t.forgotPassword.loginLink}
      </Link>
    </>
  );
}
