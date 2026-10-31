/**
 * A throwaway project mixing `.cerial` and TypeScript. The handles module imports `cerial/schema`, which only
 * resolves to the built package, so the project's tsconfig points it at source instead.
 */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCHEMA_SRC = resolve(import.meta.dir, '../../src/schema/index.ts');

export const SHOP_CERIAL = `model Customer {
  id Record(int) @id
  tier Level
  orders Relation[] @model(Purchase)
}

model Shop {
  id Record(int) @id
  address Address
  spot Point
  role Role
  badge Badge
}

object Plain {
  n Int
  m Int
}

literal Badge {
  'none',
  Address
}
`;

export const ORDERS_MODULE = `import { e, enum as enumeration, f, literal, model, object, tuple, variant } from 'cerial/schema';
import { Customer, Plain } from './cerial/handles';

export const Address = object('Address', { street: f.string(), city: f.string() });
export const Point = tuple('Point', { x: e.float(), y: e.float() });
export const Level = literal('Level', [variant.string('low'), variant.string('high')]);
export const Role = enumeration('Role', ['ADMIN', 'USER']);

export const Purchase = model('Purchase', {
  id: f.record('int').id(),
  customer: f.relation(Customer),
  plain: f.object(Plain),
});
`;

/** No declaration, like a validation schema that happens to be named `*.schema.ts` */
export const NOTES_MODULE = "export const note = 'not a schema';\n";

const created: string[] = [];

export async function mixedProject(files: Record<string, string>): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cerial-mixed-merge-')));
  created.push(dir);
  const all = {
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { 'cerial/schema': [SCHEMA_SRC] } } }),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return dir;
}

export async function removeMixedProjects(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}
