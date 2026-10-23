import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/env.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
