import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vercel.ts', 'src/scripts/seedAdmin.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@bpi/shared'],
});
