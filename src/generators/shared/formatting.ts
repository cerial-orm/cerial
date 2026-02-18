/**
 * Shared formatting utilities for all generators
 */

import { mkdir } from 'node:fs/promises';
import { Biome } from '@biomejs/js-api/nodejs';

/** Biome instance cache */
let biomeInstance: Biome | null = null;
let biomeProjectKey: number | null = null;

/** Ensure directory exists */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Get or create Biome instance with config */
function getBiome(): { biome: Biome; projectKey: number } {
  if (biomeInstance && biomeProjectKey) {
    return { biome: biomeInstance, projectKey: biomeProjectKey };
  }

  biomeInstance = new Biome();
  const { projectKey } = biomeInstance.openProject();

  biomeInstance.applyConfiguration(projectKey, {
    formatter: {
      indentStyle: 'space',
      indentWidth: 2,
      lineWidth: 120,
      lineEnding: 'lf',
    },
    javascript: {
      formatter: {
        quoteStyle: 'single',
        trailingCommas: 'all',
        semicolons: 'always',
        arrowParentheses: 'always',
        bracketSpacing: true,
      },
    },
  });

  biomeProjectKey = projectKey;

  return { biome: biomeInstance, projectKey };
}

/** Format TypeScript code with Biome */
export async function formatCode(code: string, _outputDir: string): Promise<string> {
  try {
    const { biome, projectKey } = getBiome();
    const result = biome.formatContent(projectKey, code, {
      filePath: 'generated.ts',
    });

    return result.content;
  } catch {
    // If Biome fails, return the original code
    return code;
  }
}
