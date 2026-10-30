/**
 * Único archivo de textos de la app (es-AR). Cada agente agrega claves solo bajo su
 * propio prefijo para que los merges no choquen.
 */
export const es = {
  app: {
    name: 'Macritos',
    tagline: 'Contá tus calorías sin vueltas',
    description: 'Seguimiento de calorías y macros con IA por foto.',
  },
  auth: {
    submitting: 'Un momento…',
    fields: {
      email: 'Email',
      password: 'Contraseña',
      newPassword: 'Contraseña nueva',
      confirmPassword: 'Repetí la contraseña',
    },
    login: {
      title: 'Ingresar',
      submit: 'Ingresar',
      forgotLink: '¿Olvidaste tu contraseña?',
      registerLink: 'Crear cuenta',
    },
    register: {
      title: 'Crear cuenta',
      subtitle: 'El registro es solo por invitación.',
      submit: 'Crear cuenta',
      loginLink: 'Ya tengo cuenta',
      checkEmail: 'Te mandamos un email para confirmar la cuenta.',
    },
    forgotPassword: {
      title: 'Recuperar contraseña',
      subtitle: 'Te mandamos un link para elegir una contraseña nueva.',
      submit: 'Enviar link',
      sent: 'Si el email está registrado, en unos minutos te llega un link.',
      loginLink: 'Volver a ingresar',
    },
    resetPassword: {
      title: 'Contraseña nueva',
      submit: 'Guardar contraseña',
    },
    signOut: 'Cerrar sesión',
    errors: {
      invalidEmail: 'Ingresá un email válido.',
      passwordRequired: 'Ingresá tu contraseña.',
      passwordTooShort: 'La contraseña debe tener al menos 8 caracteres.',
      passwordTooLong: 'La contraseña es demasiado larga (máximo 72 caracteres).',
      passwordMismatch: 'Las contraseñas no coinciden.',
      invalidCredentials: 'Email o contraseña incorrectos.',
      notAllowed: 'Este email no está autorizado para registrarse.',
      alreadyRegistered: 'Ya existe una cuenta con ese email.',
      sessionExpired: 'El link venció. Pedí uno nuevo.',
      generic: 'No pudimos completar la operación. Probá de nuevo.',
    },
  },
  foods: {
    attribution: {
      // Exigido por las condiciones de uso de ARGENFOODS: citar a los titulares y la referencia
      // electrónica completa. Mostrarlo donde se vean alimentos de origen `ar_seed`.
      argenfoods:
        'Composición de alimentos: ARGENFOODS, Universidad Nacional de Luján (UNLu), Argentina. https://www.argenfood.unlu.edu.ar/. Uso sin fines comerciales.',
    },
  },
} as const;
