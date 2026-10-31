/**
 * Shared by the cascade tests: one project, three ways of reaching its modules, and a filter built the way
 * `generate` builds it. The project holds `schemas/a.schema.ts` (A) and `schemas/drafts/b.schema.ts` (B);
 * `schemas/entry.ts` imports both and registers both, and is not itself a `*.schema.ts`, so path discovery
 * leaves it alone.
 */
import { join } from 'node:path';
import { resolvePathFilter, type FilterConfig, type PathFilter } from '../../../../src/cli/filters';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { modelModule, SCHEMA_SRC, tempProject } from '../../../registration-project';

export type Mode = 'path' | 'files' | 'entry';
export const MODES: readonly Mode[] = ['path', 'files', 'entry'];

export const ENTRY_SOURCE = `import { defineSchema } from '${SCHEMA_SRC}';
import { A } from './a.schema';
import { B } from './drafts/b.schema';

export default defineSchema({ models: [A, B] });
`;

export function cascadeProject(extra: Record<string, string> = {}): Promise<string> {
  return tempProject({
    'schemas/a.schema.ts': modelModule('A'),
    'schemas/drafts/b.schema.ts': modelModule('B'),
    'schemas/entry.ts': ENTRY_SOURCE,
    ...extra,
  });
}

export interface Layers {
  readonly ignore?: string[];
  readonly exclude?: string[];
  readonly include?: string[];
  /** Content of the root `.cerialignore` */
  readonly cerialignore?: string;
}

/** The cascade as `generate` assembles it for a root config plus a root `.cerialignore` */
export function cascade(dir: string, layers: Layers): PathFilter {
  const { cerialignore, ...rootConfig }: { cerialignore?: string } & FilterConfig = layers;

  return resolvePathFilter({
    rootConfig,
    rootCerialIgnore:
      cerialignore === undefined ? undefined : { path: join(dir, '.cerialignore'), dir, content: cerialignore },
    basePath: dir,
  });
}

/** The model names a mode builds from the cascade project, sorted */
export async function modelsFor(mode: Mode, dir: string, filter: PathFilter | undefined): Promise<string[]> {
  const schemas = join(dir, 'schemas');
  const source = {
    path: { schemaPath: schemas },
    files: { files: [join(schemas, 'a.schema.ts'), join(schemas, 'drafts/b.schema.ts')], filterBase: schemas },
    entry: { entry: join(schemas, 'entry.ts'), filterBase: schemas },
  }[mode];
  const built = await buildResolvedSchemaAst({ ...source, filter });

  return (built.resolvedAST?.models.map((m) => m.name) ?? []).sort();
}
