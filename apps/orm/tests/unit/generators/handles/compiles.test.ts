import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { syncHandles } from '../../../../src/generators/handles';
import { parseSchema } from './helpers';

const SCHEMA = `
abstract model Base {
  id Record(int) @id
  createdBy String
  secret String !!private
}
model Child extends Base {
  title String
}
object Address {
  street String
}
tuple Point {
  x Float,
  Float
}
enum Role {
  ADMIN
  USER
}
literal Level {
  'low',
  1,
  Int
}
`;

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

/** Write the emitted handles plus `user` into a scratch project that resolves `cerial/schema` to source, and type-check it */
async function check(user: string): Promise<{ code: number; out: string }> {
  // Inside tests/ so the compiler finds the repo's node_modules for the types the builder imports
  const dir = await mkdtemp(join(import.meta.dir, 'compile-'));
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  await syncHandles(dir, parseSchema(SCHEMA));
  await writeFile(join(dir, 'user.ts'), user);
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      extends: join(import.meta.dir, '../../../../../../tsconfig.json'),
      compilerOptions: {
        baseUrl: dir,
        paths: { 'cerial/schema': [join(import.meta.dir, '../../../../src/schema/index.ts')] },
      },
      include: ['**/*.ts'],
    }),
  );
  const tsc = Bun.spawn(['bunx', 'tsc', '--noEmit', '-p', dir], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(tsc.stdout).text();

  return { code: await tsc.exited, out };
}

describe('emitted handles type-check against cerial/schema', () => {
  it('compiles on its own and lets a child pick and omit inherited members, by index and by name', async () => {
    const { code, out } = await check(`
import { model, object, f } from 'cerial/schema';
import { Base, Child, Point, Level, Role, Address } from './cerial/handles';

export const A = model('A', { extra: f.int() }, { extends: Base.pick('id', 'createdBy') });
export const B = model('B', { extra: f.int() }, { extends: Child.omit('title') });
export const C = object('C', { extra: f.int() }, { extends: Address });
export const roles = [Role, Level, Point.pick('x', 1)];
`);
    expect(code, out).toBe(0);
  }, 120_000);

  it('rejects a pick of a member the handle does not list, so the check above is real', async () => {
    const { code, out } = await check(`
import { model, f } from 'cerial/schema';
import { Base } from './cerial/handles';

export const A = model('A', { extra: f.int() }, { extends: Base.pick('nope') });
`);
    expect(code).not.toBe(0);
    expect(out).toContain('nope');
  }, 120_000);
});
