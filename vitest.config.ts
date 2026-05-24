import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/slides/src/**/*.test.{ts,tsx}'],
    setupFiles: ['./packages/slides/test/setup-snapshots.ts'],
  },
});
