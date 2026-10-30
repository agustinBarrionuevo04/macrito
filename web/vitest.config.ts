import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/types/**',
        'src/app/**',
        'src/**/test-helpers.ts',
      ],
      thresholds: {
        // El plan exige ≥ 95 % en el módulo de cálculo nutricional.
        'src/lib/nutrition/**': { statements: 95, branches: 95, functions: 95, lines: 95 },
      },
    },
  },
});
