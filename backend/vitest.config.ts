import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      STORAGE_DRIVER: 'local',
      MAX_FILE_SIZE_MB: '5',
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
