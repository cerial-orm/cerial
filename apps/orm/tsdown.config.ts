import { defineConfig } from 'tsdown';

export default defineConfig([
  // Library entry points (dual CJS/ESM)
  {
    entry: {
      index: 'index.ts',
      parser: 'src/parser/index.ts',
      generators: 'src/generators/index.ts',
      query: 'src/query/index.ts',
      client: 'src/client/index.ts',
      cli: 'src/cli/index.ts',
      utils: 'src/utils/index.ts',
      types: 'src/types/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    fixedExtension: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    platform: 'node',
    target: 'node18',
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
