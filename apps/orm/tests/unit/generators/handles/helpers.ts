import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { handlesPath, syncHandles } from '../../../../src/generators/handles';
import type { HandlesOutcome } from '../../../../src/generators/handles';
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';

/** The pass-1 AST of one `.cerial` source, parsed the way generation parses it */
export function parseSchema(source: string): SchemaAST {
  const result = parse(
    source,
    new Set(collectObjectNames(source)),
    new Set(collectTupleNames(source)),
    new Set(collectLiteralNames(source)),
    new Set(collectEnumNames(source)),
    'handles.cerial',
  );
  if (result.errors.length) throw new Error(result.errors.map((e) => e.message).join('; '));

  return result.ast;
}

/** The export line for `name`, so a test asserts on one declaration rather than the whole module */
export function lineOf(text: string, name: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`export const ${name} = `));
  if (!line) throw new Error(`No export named ${name} in:\n${text}`);

  return line;
}

const REPO_SRC = join(import.meta.dir, '../../../../src');

/** A scratch project inside tests/, so the compiler and the runtime find the repo's node_modules */
export async function scratchProject(): Promise<string> {
  return mkdtemp(join(import.meta.dir, 'scratch-'));
}

/** Type-check every .ts file under `dir`, with `cerial/schema` resolved to source */
export async function typecheckProject(dir: string): Promise<{ code: number; out: string }> {
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      extends: join(import.meta.dir, '../../../../../../tsconfig.json'),
      compilerOptions: { baseUrl: dir, paths: { 'cerial/schema': [join(REPO_SRC, 'schema/index.ts')] } },
      include: ['**/*.ts'],
    }),
  );
  const tsc = Bun.spawn(['bunx', 'tsc', '--noEmit', '-p', dir], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(tsc.stdout).text();

  return { code: await tsc.exited, out };
}

/**
 * Regenerate `<dir>/cerial/handles.ts` from `source` the way generation does, then point its
 * `cerial/schema` import at source so the module can run without a built package.
 */
export async function regenerateHandles(dir: string, source: string): Promise<HandlesOutcome> {
  const outcome = await syncHandles(dir, parseSchema(source));
  const path = handlesPath(dir);
  const text = await readFile(path, 'utf-8');
  await writeFile(path, text.replace("'cerial/schema'", `'${join(REPO_SRC, 'schema/index.ts')}'`));

  return outcome;
}
