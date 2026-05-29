import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  test: {
    environment: 'jsdom',
  },
});
