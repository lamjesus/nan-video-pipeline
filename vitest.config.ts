import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Los imports en src/ usan extensión .js (ESM).
      // Vitest necesita resolver .js -> .ts para que funcionen.
      // Este alias quita la extensión .js para que vitest la resuelva como .ts
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});