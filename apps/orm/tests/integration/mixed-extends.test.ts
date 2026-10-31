/**
 * `extends` across the `.cerial`/TypeScript boundary, both directions, with a plain parent, a pick list, an omit
 * list and an abstract parent. Each case gets a small project of its own, so the shared fixture stays small.
 * Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

afterAll(removeMixedProjects);

const HEAD = "import { f, model } from 'cerial/schema';\nimport * as h from './cerial/handles';\n";

// Parents declared in `.cerial`; the TypeScript half extends them through their handles
const CERIAL_PARENTS = `abstract model CPlain {
  id Record(int) @id
  name String
  email String
}

abstract model CBase {
  id Record(int) @id
  name String
  email String
  secret String !!private
}
`;

// Parents declared in TypeScript; the `.cerial` half extends them by name
const TS_PARENTS = `${HEAD}
export const TPlain = model(
  'TPlain',
  { id: f.record('int').id(), name: f.string(), email: f.string() },
  { abstract: true },
);
export const TBase = model(
  'TBase',
  { id: f.record('int').id(), name: f.string(), email: f.string(), secret: f.string().private() },
  { abstract: true },
);
`;

const TS_CHILDREN = `
export const TPlainKid = model('TPlainKid', { extra: f.string() }, { extends: h.CPlain });
export const TPickKid = model('TPickKid', { extra: f.string() }, { extends: h.CPlain.pick('id', 'name') });
export const TOmitKid = model('TOmitKid', { extra: f.string() }, { extends: h.CPlain.omit('email') });
// An abstract child in the child's own syntax, then a concrete grandchild of it
export const TMid = model('TMid', { extra: f.string() }, { extends: h.CPlain, abstract: true });
export const TLeaf = model('TLeaf', { more: f.string() }, { extends: TMid });
export const TPrivateKid = model('TPrivateKid', { extra: f.string() }, { extends: h.CBase.pick('id', 'name', 'email') });
`;

const CERIAL_CHILDREN = `model CPlainKid extends TPlain {
  extra String
}

model CPickKid extends TPlain[id, name] {
  extra String
}

model COmitKid extends TPlain[!email] {
  extra String
}

abstract model CMid extends TPlain {
  extra String
}

model CLeaf extends CMid {
  more String
}

model CPrivateKid extends TBase[id, name, email] {
  extra String
}
`;

async function resolved(files: Record<string, string>): Promise<Map<string, string[]>> {
  const built = await buildResolvedSchemaAst({ schemaPath: await mixedProject(files) });

  expect([...built.parseErrors, ...built.extendsErrors.map((e) => e.message)]).toEqual([]);

  return new Map(
    (built.resolvedAST?.models ?? []).map((m) => [m.name, m.fields.map((f) => f.name).sort()] as [string, string[]]),
  );
}

async function failure(files: Record<string, string>): Promise<string> {
  return buildResolvedSchemaAst({ schemaPath: await mixedProject(files) }).then(
    (r) => [...r.parseErrors, ...r.extendsErrors.map((e) => e.message)].join('\n'),
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}

describe('a TypeScript model extending a .cerial parent', () => {
  let models: Map<string, string[]>;

  const load = async (): Promise<Map<string, string[]>> =>
    (models ??= await resolved({ 'p.cerial': CERIAL_PARENTS, 'c.schema.ts': HEAD + TS_CHILDREN }));

  it('inherits every field of a plain parent', async () => {
    expect((await load()).get('TPlainKid')).toEqual(['email', 'extra', 'id', 'name']);
  });

  it('inherits only the picked fields', async () => {
    expect((await load()).get('TPickKid')).toEqual(['extra', 'id', 'name']);
  });

  it('inherits all but the omitted fields', async () => {
    expect((await load()).get('TOmitKid')).toEqual(['extra', 'id', 'name']);
  });

  it('passes the inherited fields on through an abstract child to its own child', async () => {
    const loaded = await load();

    expect(loaded.get('TLeaf')).toEqual(['email', 'extra', 'id', 'more', 'name']);
  });

  it('leaves a private parent field out through a pick list', async () => {
    const fields = (await load()).get('TPrivateKid');

    expect(fields).toEqual(['email', 'extra', 'id', 'name']);
    expect(fields).not.toContain('secret');
  });
});

describe('a .cerial model extending a TypeScript parent', () => {
  let models: Map<string, string[]>;

  const load = async (): Promise<Map<string, string[]>> =>
    (models ??= await resolved({ 'p.schema.ts': TS_PARENTS, 'c.cerial': CERIAL_CHILDREN }));

  it('inherits every field of a plain parent', async () => {
    expect((await load()).get('CPlainKid')).toEqual(['email', 'extra', 'id', 'name']);
  });

  it('inherits only the picked fields', async () => {
    expect((await load()).get('CPickKid')).toEqual(['extra', 'id', 'name']);
  });

  it('inherits all but the omitted fields', async () => {
    expect((await load()).get('COmitKid')).toEqual(['extra', 'id', 'name']);
  });

  it('passes the inherited fields on through an abstract child to its own child', async () => {
    const loaded = await load();

    expect(loaded.get('CLeaf')).toEqual(['email', 'extra', 'id', 'more', 'name']);
  });

  it('leaves a private parent field out through a pick list', async () => {
    const fields = (await load()).get('CPrivateKid');

    expect(fields).toEqual(['email', 'extra', 'id', 'name']);
    expect(fields).not.toContain('secret');
  });
});

describe('!!private on a parent in the other syntax', () => {
  it('stops a .cerial child redeclaring a private TypeScript field', async () => {
    const message = await failure({
      'p.schema.ts': TS_PARENTS,
      'c.cerial': 'model Redeclares extends TBase {\n  secret String\n}\n',
    });

    expect(message).toContain('Private fields cannot be overridden');
    expect(message).toContain('secret');
  });

  it('stops a .cerial child redeclaring a private field the pick list left out', async () => {
    const message = await failure({
      'p.schema.ts': TS_PARENTS,
      'c.cerial': 'model Redeclares extends TBase[id] {\n  secret String\n}\n',
    });

    expect(message).toContain('Private fields cannot be overridden');
    expect(message).toContain('secret');
  });

  it('stops a TypeScript child redeclaring a private .cerial field, when generation reads it', async () => {
    const message = await failure({
      'p.cerial': CERIAL_PARENTS,
      'c.schema.ts': `${HEAD}\nexport const Redeclares = model('Redeclares', { secret: f.string() }, { extends: h.CBase });\n`,
    });

    expect(message).toContain('Private fields cannot be overridden');
    expect(message).toContain('secret');
  });

  it('still allows a pick list to omit the private field, in both directions', async () => {
    const fromCerial = await resolved({ 'p.cerial': CERIAL_PARENTS, 'c.schema.ts': HEAD + TS_CHILDREN });
    const fromTs = await resolved({ 'p.schema.ts': TS_PARENTS, 'c.cerial': CERIAL_CHILDREN });

    expect(fromCerial.get('TPrivateKid')).toEqual(['email', 'extra', 'id', 'name']);
    expect(fromTs.get('CPrivateKid')).toEqual(['email', 'extra', 'id', 'name']);
  });
});

describe('an abstract parent in either syntax', () => {
  const cases: { label: string; files: Record<string, string>; abstract: string[]; concrete: string[] }[] = [
    {
      label: '.cerial parents and TypeScript children',
      files: { 'p.cerial': CERIAL_PARENTS, 'c.schema.ts': HEAD + TS_CHILDREN },
      abstract: ['CPlain', 'CBase', 'TMid'],
      concrete: ['TLeaf', 'TPlainKid'],
    },
    {
      label: 'TypeScript parents and .cerial children',
      files: { 'p.schema.ts': TS_PARENTS, 'c.cerial': CERIAL_CHILDREN },
      abstract: ['TPlain', 'TBase', 'CMid'],
      concrete: ['CLeaf', 'CPlainKid'],
    },
  ];

  for (const { label, files, abstract, concrete } of cases) {
    it(`produces no table, type, accessor or registry entry for them, with ${label}`, async () => {
      const dir = await mixedProject(files);
      const out = join(dir, 'out');
      const result = await generateSingleSchema({ schemaPath: dir, outputDir: out, logLevel: 'minimal' });
      const names = (await readdir(out, { recursive: true })).filter((f) => f.endsWith('.ts'));
      const text = (await Promise.all(names.map((f) => readFile(join(out, f), 'utf8')))).join('\n');

      expect(result.errors).toEqual([]);
      // The children are generated, so what is absent below is the parents' doing and not an empty run
      for (const name of concrete) {
        expect(names).toContain(`models/${name.toLowerCase()}.ts`);
        expect(text).toMatch(new RegExp(`\\b${name}\\b`));
      }
      for (const name of abstract) {
        expect(names.map((f) => f.toLowerCase())).not.toContain(`models/${name.toLowerCase()}.ts`);
        expect(text).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    });
  }

  it('refuses a concrete parent across the boundary, as it does within one syntax', async () => {
    const message = await failure({
      'p.schema.ts': `${HEAD}\nexport const Concrete = model('Concrete', { id: f.record('int').id() });\n`,
      'c.cerial': 'model Kid extends Concrete {\n  x String\n}\n',
    });

    expect(message).toContain('can only extend abstract');
  });
});

describe('pick and omit across the boundary', () => {
  it('refuses a TypeScript extends clause carrying both, because the builder has no such call', async () => {
    const dir = await mixedProject({
      'p.cerial': CERIAL_PARENTS,
      'c.schema.ts': `${HEAD}\nexport const Both = model('Both', { x: f.string() }, { extends: h.CPlain.pick('id').omit('name') });\n`,
    });

    await expect(buildResolvedSchemaAst({ schemaPath: dir })).rejects.toThrow(/omit is not a function/);
  });

  it('refuses a .cerial extends clause mixing both over a TypeScript parent', async () => {
    const message = await failure({
      'p.schema.ts': TS_PARENTS,
      'c.cerial': 'model Both extends TPlain[id, !name] {\n  x String\n}\n',
    });

    expect(message).toContain('Cannot mix pick and omit');
  });
});

describe('a pick list naming a field the parent does not have', () => {
  it('fails for a TypeScript parent extended from .cerial', async () => {
    const message = await failure({
      'p.schema.ts': TS_PARENTS,
      'c.cerial': 'model Bad extends TPlain[id, nope] {\n  x String\n}\n',
    });

    expect(message).toContain('nope');
  });

  it('fails for a .cerial parent extended from TypeScript, naming the member the handle lacks', async () => {
    const message = await failure({
      'p.cerial': CERIAL_PARENTS,
      // The compiler refuses this name through the handle; the module is loaded without a typecheck
      'c.schema.ts': `${HEAD}\nexport const Bad = model('Bad', { x: f.string() }, { extends: h.CPlain.pick('id', 'nope') });\n`,
    });

    expect(message).toContain('nope');
  });
});
