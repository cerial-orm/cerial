import { existsSync, lstatSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from '../parser';
import { findSchemaRoots, findSchemasInDir } from '../resolvers/schema-resolver';
import type { Command } from './types';

export type ConfigFormat = 'typescript' | 'json';

export interface DetectedSchema {
  name: string;
  path: string;
}

const CONFIG_FILENAMES = ['cerial.config.ts', 'cerial.config.json'] as const;

const LEGACY_SCHEMA_DIRS = ['schemas', 'schema'] as const;

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((res) => {
    rl.question(question, (answer) => {
      res(answer.trim());
    });
  });
}

export function deriveSchemaName(folderPath: string): string {
  return basename(folderPath);
}

export function findExistingConfig(cwd: string): string | null {
  for (const filename of CONFIG_FILENAMES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) return filename;
  }

  return null;
}

export async function detectSchemaFolders(cwd: string): Promise<DetectedSchema[]> {
  const roots = await findSchemaRoots(cwd);

  if (roots.length) {
    return roots
      .filter((root) => root.files.length)
      .map((root) => ({
        name: deriveSchemaName(root.path),
        path: toRelativePath(root.path, cwd),
      }));
  }

  for (const dir of LEGACY_SCHEMA_DIRS) {
    const fullPath = resolve(cwd, dir);
    try {
      const stat = lstatSync(fullPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const files = await findSchemasInDir(fullPath, ['**/*.cerial']);
    if (files.length) {
      const subSchemas = await detectSubSchemas(fullPath, cwd);
      if (subSchemas.length > 1) return subSchemas;

      return [{ name: deriveSchemaName(fullPath), path: toRelativePath(fullPath, cwd) }];
    }
  }

  return [];
}

async function detectSubSchemas(parentDir: string, cwd: string): Promise<DetectedSchema[]> {
  const subSchemas: DetectedSchema[] = [];

  try {
    const { Glob } = await import('bun');
    const entries = await Array.fromAsync(new Glob('*/').scan({ cwd: parentDir, onlyFiles: false }));

    for (const entry of entries) {
      const subDir = resolve(parentDir, entry);
      try {
        const stat = lstatSync(subDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const files = await findSchemasInDir(subDir, ['**/*.cerial']);
      if (files.length) {
        subSchemas.push({
          name: deriveSchemaName(subDir),
          path: toRelativePath(subDir, cwd),
        });
      }
    }
  } catch {
    // scan failed — directory inaccessible
  }

  return subSchemas;
}

export function toRelativePath(absolutePath: string, cwd: string): string {
  const rel = relative(cwd, absolutePath);
  if (rel.startsWith('.')) return rel;

  return `./${rel}`;
}

export function generateTsConfig(schemas: DetectedSchema[]): string {
  if (!schemas.length) {
    return [
      "import { defineConfig } from 'cerial';",
      '',
      'export default defineConfig({',
      "  schema: './schemas',",
      "  output: './client',",
      '});',
      '',
    ].join('\n');
  }

  if (schemas.length === 1) {
    const schema = schemas[0]!;

    return [
      "import { defineConfig } from 'cerial';",
      '',
      'export default defineConfig({',
      `  schema: '${schema.path}',`,
      "  output: './client',",
      '});',
      '',
    ].join('\n');
  }

  const schemaEntries = schemas.map((s) => `    ${s.name}: { path: '${s.path}' },`);

  return [
    "import { defineConfig } from 'cerial';",
    '',
    'export default defineConfig({',
    '  schemas: {',
    ...schemaEntries,
    '  },',
    '});',
    '',
  ].join('\n');
}

export function generateJsonConfig(schemas: DetectedSchema[]): string {
  if (!schemas.length) {
    const config = {
      schema: './schemas',
      output: './client',
    };

    return `${JSON.stringify(config, null, 2)}\n`;
  }

  if (schemas.length === 1) {
    const schema = schemas[0]!;
    const config = {
      schema: schema.path,
      output: './client',
    };

    return `${JSON.stringify(config, null, 2)}\n`;
  }

  const schemasMap: Record<string, { path: string }> = {};
  for (const s of schemas) {
    schemasMap[s.name] = { path: s.path };
  }

  const config = { schemas: schemasMap };

  return `${JSON.stringify(config, null, 2)}\n`;
}

export function generateConfigContent(schemas: DetectedSchema[], format: ConfigFormat): string {
  if (format === 'json') return generateJsonConfig(schemas);

  return generateTsConfig(schemas);
}

export function getConfigFilename(format: ConfigFormat): string {
  return format === 'json' ? 'cerial.config.json' : 'cerial.config.ts';
}

export const initCommand: Command = {
  name: 'init',
  aliases: [],
  description: 'Initialize a cerial config file',
  async run(args) {
    const options = parseArgs(args);
    const cwd = process.cwd();
    const autoAccept = options.yes ?? false;

    const existing = findExistingConfig(cwd);
    if (existing) {
      console.error(`\n  A config file already exists: ${existing}`);
      console.error('  Remove it first if you want to reinitialize.\n');
      process.exit(1);
    }

    const detected = await detectSchemaFolders(cwd);

    let schemas: DetectedSchema[] = [];
    let format: ConfigFormat = 'typescript';

    if (autoAccept) {
      schemas = detected;
      format = 'typescript';
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      try {
        if (detected.length) {
          const paths = detected.map((s) => s.path).join(', ');
          const confirmAnswer = await ask(rl, `\n  Found schema folders: ${paths}\n  Configure them? (Y/n) `);
          const declined = confirmAnswer.toLowerCase() === 'n';

          if (!declined) {
            for (const schema of detected) {
              const nameAnswer = await ask(rl, `  Schema name for ${schema.path}? (default: ${schema.name}) `);
              if (nameAnswer) schema.name = nameAnswer;
            }
            schemas = detected;
          }
        } else {
          console.log('\n  No schema folders detected.');
          console.log('  Generating config with default paths.\n');
        }

        const formatAnswer = await ask(rl, '  Output format: TypeScript or JSON? (default: TypeScript) ');
        if (formatAnswer.toLowerCase() === 'json') format = 'json';
      } finally {
        rl.close();
      }
    }

    const filename = getConfigFilename(format);
    const content = generateConfigContent(schemas, format);
    const outputPath = resolve(cwd, filename);

    await Bun.write(outputPath, content);

    console.log(`\n  Created ${filename}\n`);
    process.exit(0);
  },
};
