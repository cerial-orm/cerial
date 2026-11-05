import { existsSync, lstatSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { defineCommand } from 'citty';
import fg from 'fast-glob';
import { schemaNameProblem, toClientClassName } from '../config';
import { findSchemaRoots, findSchemasInDir } from '../resolvers/schema-resolver';

export type ConfigFormat = 'typescript' | 'json';

export interface DetectedSchema {
  name: string;
  path: string;
}

const CONFIG_FILENAMES = ['cerial.config.ts', 'cerial.config.json'] as const;

const LEGACY_SCHEMA_DIRS = ['schemas', 'schema'] as const;

const DEFAULT_CERIALIGNORE = `# Cerial ignore file - patterns here exclude .cerial files from generation
# Syntax follows .gitignore rules

# Common exclusions
node_modules/
.git/

# Example: exclude draft schemas
# drafts/
# **/experimental/
`;

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

/** A string literal in single quotes; JSON.stringify escapes backslashes, control characters and the line terminators */
function quote(value: string): string {
  return `'${JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

/** The documented default output of a schema entry: `client` inside its folder */
function clientDir(path: string): string {
  return `${path.replace(/\/+$/, '')}/client`;
}

/** A property key: bare when it is a plain identifier (no churn for ordinary names), quoted otherwise. `__proto__` is computed: as a literal key, quoted or not, it sets the prototype instead of an own key */
function key(name: string): string {
  if (name === '__proto__') return `[${quote(name)}]`;

  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : quote(name);
}

/** The folder name when it is a valid schema name, else the nearest valid one (`a b` becomes `a_b`, `1abc` becomes `abc`) */
export function toValidSchemaName(name: string): string {
  if (!schemaNameProblem(name)) return name;
  let derived = name.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]+/, '');
  if (!derived) derived = 'schema';
  // A reserved name (`default`) or a class that collides gets a suffix; `_` is allowed at the end of a name
  for (let i = 0; schemaNameProblem(derived) && i < 3; i++) derived = `${derived}_`;

  return schemaNameProblem(derived) ? 'schema' : derived;
}

/** Gives every schema a valid, unique name and returns what it changed so the caller can say so */
export function normalizeSchemaNames(schemas: DetectedSchema[]): string[] {
  const notes: string[] = [];
  // Keyed by derived client class, ignoring case: names that derive one class share migration state
  const taken = new Set<string>();
  const classKey = (n: string): string => toClientClassName(n).toLowerCase();

  for (const schema of schemas) {
    const original = schema.name;
    const valid = toValidSchemaName(original);
    let name = valid;
    for (let n = 2; taken.has(classKey(name)); n++) name = `${valid}_${n}`;
    taken.add(classKey(name));
    schema.name = name;
    if (name === original) continue;

    const why = valid !== original ? 'is not a valid schema name' : 'is already used by another schema';
    notes.push(`Schema name ${quote(original)} for ${quote(schema.path)} ${why}; using ${quote(name)}`);
  }

  return notes;
}

/** Schema files under a folder whose name holds a backslash: discovery does not read those, so init says so */
export async function findBackslashSchemaFiles(cwd: string): Promise<string[]> {
  const files = await fg('**/*.cerial', { cwd, ignore: ['**/node_modules/**'] });

  return files.filter((f) => f.includes('\\'));
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
    const entries = await fg('*/', { cwd: parentDir, onlyFiles: false });

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
      `  schema: ${quote(schema.path)},`,
      "  output: './client',",
      '});',
      '',
    ].join('\n');
  }

  const schemaEntries = schemas.map(
    (s) => `    ${key(s.name)}: { path: ${quote(s.path)}, output: ${quote(clientDir(s.path))} },`,
  );

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

  // fromEntries defines own keys, so a name like __proto__ stays data
  const config = {
    schemas: Object.fromEntries(schemas.map((s) => [s.name, { path: s.path, output: clientDir(s.path) }])),
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}

export function generateConfigContent(schemas: DetectedSchema[], format: ConfigFormat): string {
  if (format === 'json') return generateJsonConfig(schemas);

  return generateTsConfig(schemas);
}

export function getConfigFilename(format: ConfigFormat): string {
  return format === 'json' ? 'cerial.config.json' : 'cerial.config.ts';
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a cerial config file',
  },
  args: {
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Accept all defaults, skip interactive prompts',
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const autoAccept = args.yes ?? false;

    const existing = findExistingConfig(cwd);
    if (existing) {
      console.error(`\n  A config file already exists: ${existing}`);
      console.error('  Remove it first if you want to reinitialize.\n');
      process.exit(1);
    }

    const detected = await detectSchemaFolders(cwd);
    for (const file of await findBackslashSchemaFiles(cwd)) {
      console.log(`  Skipped ${quote(file)}: schema folders with a backslash in their name are not detected`);
    }

    let schemas: DetectedSchema[] = [];
    let format: ConfigFormat = 'typescript';

    if (autoAccept) {
      schemas = detected;
      format = 'typescript';
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      try {
        if (detected.length) {
          const paths = detected.map((s) => quote(s.path)).join(', ');
          const confirmAnswer = await ask(rl, `\n  Found schema folders: ${paths}\n  Configure them? (Y/n) `);
          const declined = confirmAnswer.toLowerCase() === 'n';

          if (!declined) {
            for (const schema of detected) {
              const nameAnswer = await ask(
                rl,
                `  Schema name for ${quote(schema.path)}? (default: ${quote(schema.name)}) `,
              );
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

    for (const note of normalizeSchemaNames(schemas)) console.log(`  ${note}`);

    const filename = getConfigFilename(format);
    const content = generateConfigContent(schemas, format);
    const outputPath = resolve(cwd, filename);

    await writeFile(outputPath, content, 'utf-8');

    console.log(`\n  Created ${filename}\n`);

    if (!autoAccept) {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });

      try {
        const ignoreAnswer = await ask(rl2, '  Create .cerialignore? (Y/n) ');
        if (ignoreAnswer.toLowerCase() !== 'n') {
          const ignoreOutputPath = resolve(cwd, '.cerialignore');
          await writeFile(ignoreOutputPath, DEFAULT_CERIALIGNORE, 'utf-8');
          console.log('  Created .cerialignore\n');
        }
      } finally {
        rl2.close();
      }
    }

    process.exit(0);
  },
});
