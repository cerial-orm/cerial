import { defineConfig } from 'tsdown';

export default defineConfig([
  // Library entry points (dual CJS/ESM)
  {
    entry: [
      'src/index.ts',
      'src/parser/index.ts',
      'src/generators/index.ts',
      'src/query/index.ts',
      'src/client/index.ts',
      'src/cli/index.ts',
      'src/utils/index.ts',
      'src/types/index.ts',
    ],
    format: ['esm', 'cjs'],
    dts: true,
    fixedExtension: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    unbundle: true,
  },
  // CLI binary (ESM-only — citty is ESM-only)
  {
    entry: { 'bin/cerial': 'bin/cerial.ts' },
    format: ['esm'],
    fixedExtension: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
