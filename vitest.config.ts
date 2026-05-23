import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'templates/*/src/**/*.test.{ts,tsx}',
      'templates/*/tools/**/*.test.{ts,tsx}',
    ],
  },
});
