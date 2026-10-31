/**
 * Generates the client the mixed type checks compile against, into `typechecks/mixed/generated`.
 *
 * `cerial generate` writes `cerial/handles.ts` beside the sources, and `tests/fixtures/mixed` must stay free of
 * generated files, so the project is built in a temp directory from the committed fixture plus the extra
 * declarations in `typechecks/mixed/extra`. Only the client is copied back.
 */

import { cp, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ORM_DIR = resolve(import.meta.dir, '..', '..');
const FIXTURE = join(ORM_DIR, 'tests/fixtures/mixed');
const EXTRA = join(import.meta.dir, 'typechecks/mixed/extra');
const DESTINATION = join(import.meta.dir, 'typechecks/mixed/generated');
const SCHEMA_SRC = join(ORM_DIR, 'src/schema/index.ts');

const dir = await mkdtemp(join(tmpdir(), 'cerial-mixed-typecheck-'));
let code = 1;
try {
  await cp(FIXTURE, dir, { recursive: true });
  await cp(EXTRA, join(dir, 'schema'), { recursive: true });
  // Kept as .txt in the repo: it imports handles that exist only in the generated project, so apps/orm's tsc must not see it
  await rename(join(dir, 'schema/inherit.schema.ts.txt'), join(dir, 'schema/inherit.schema.ts'));
  // Resolves `cerial/schema` to the source tree, so the check needs no built package
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { 'cerial/schema': [SCHEMA_SRC] } } }),
  );
  const proc = Bun.spawn([process.execPath, 'run', join(ORM_DIR, 'bin/cerial.ts'), 'generate', '-y'], {
    cwd: dir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  code = await proc.exited;
  if (!code) {
    await rm(DESTINATION, { recursive: true, force: true });
    await cp(join(dir, 'client'), DESTINATION, { recursive: true });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
process.exit(code);
