import { es } from '@/lib/i18n/es';
import { updatePassword } from '../actions';
import { AuthForm } from '../_components/auth-form';

export default function ResetPasswordPage() {
  const t = es.auth;
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.resetPassword.title}</h1>
      <AuthForm
        action={updatePassword}
        submitLabel={t.resetPassword.submit}
        fields={[
          {
            name: 'password',
            type: 'password',
            label: t.fields.newPassword,
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
    </>
  );
}
