import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    alias: { '@': new URL('./src', import.meta.url).pathname },
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
