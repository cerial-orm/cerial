/**
 * A foreign key typed by the target's `@id`, across the `.cerial`/TypeScript boundary in both directions. The
 * generated input and output types are read back from the written client, and each forward case is compared with
 * the same model written wholly in `.cerial`. Needs no database.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

afterAll(removeMixedProjects);

interface IdKind {
  readonly name: string;
  readonly cerial: string;
  readonly builder: string;
  // What the foreign key and its input read as, and whether a create must supply the target's own id
  readonly output: string;
  readonly input: string;
  readonly idRequired: boolean;
}

const KINDS: readonly IdKind[] = [
  {
    name: 'Int',
    cerial: 'Record(int)',
    builder: "f.record('int')",
    output: 'CerialId<number>',
    input: 'RecordIdInput<number>',
    idRequired: true,
  },
  {
    name: 'Str',
    cerial: 'Record(string)',
    builder: "f.record('string')",
    output: 'CerialId<string>',
    input: 'RecordIdInput<string>',
    idRequired: false,
  },
  {
    name: 'Uuid',
    cerial: 'Record(uuid)',
    builder: "f.record('uuid')",
    output: 'CerialId<string>',
    input: 'RecordIdInput<string>',
    idRequired: false,
  },
  {
    name: 'Plain',
    cerial: 'Record',
    builder: 'f.record()',
    output: 'CerialId<string>',
    input: 'RecordIdInput<string>',
    idRequired: false,
  },
  {
    name: 'Union',
    cerial: 'Record(string, int)',
    builder: "f.record('string', 'int')",
    output: 'CerialId<string | number>',
    input: 'RecordIdInput<string | number>',
    idRequired: true,
  },
];

const HEAD = "import { f, model } from 'cerial/schema';\n";

// The text of `export interface <name> {` up to its closing brace
function declaration(text: string, name: string): string {
  const start = text.indexOf(`export interface ${name} {`);
  if (start < 0) return '';

  return text.slice(start, text.indexOf('\n}', start));
}

async function generated(files: Record<string, string>): Promise<(model: string) => Promise<string>> {
  const dir = await mixedProject(files);
  const out = join(dir, 'out');
  const result = await generateSingleSchema({ schemaPath: dir, outputDir: out, logLevel: 'minimal' });
  expect(result.errors).toEqual([]);

  return (name) => readFile(join(out, 'models', `${name.toLowerCase()}.d.ts`), 'utf8');
}

// Targets declared in `.cerial`, each reached by one optional relation from a TypeScript model
const cerialTargets = KINDS.map((k) => `model Tgt${k.name} {\n  id ${k.cerial} @id\n}\n`).join('\n');
const tsHolders = `${HEAD}import { ${KINDS.map((k) => `Tgt${k.name}`).join(', ')} } from './cerial/handles';\n${KINDS.map(
  (k) =>
    `export const Hold${k.name} = model('Hold${k.name}', { id: f.record('int').id(), target: f.relation(Tgt${k.name}).optional() });`,
).join('\n')}\n`;
const cerialHolders = KINDS.map(
  (k) =>
    `model Hold${k.name} {\n  id Record(int) @id\n  targetId Record?\n  target Relation? @field(targetId) @model(Tgt${k.name})\n}\n`,
).join('\n');

describe('a TypeScript relation to a .cerial model', () => {
  let read: (model: string) => Promise<string>;
  let twin: (model: string) => Promise<string>;

  beforeAll(async () => {
    read = await generated({ 'targets.cerial': cerialTargets, 'holders.schema.ts': tsHolders });
    twin = await generated({ 'all.cerial': cerialTargets + cerialHolders });
  });

  for (const kind of KINDS) {
    describe(`to a ${kind.cerial} @id`, () => {
      it('types the foreign key in the output by the target id', async () => {
        const text = await read(`Hold${kind.name}`);

        expect(declaration(text, `Hold${kind.name}`)).toContain(`targetId?: ${kind.output};`);
      });

      it('types the foreign key in the input by the target id, optional in create', async () => {
        const text = await read(`Hold${kind.name}`);

        expect(declaration(text, `Hold${kind.name}Input`)).toContain(`targetId?: ${kind.input};`);
        expect(text).toContain(
          `export type Hold${kind.name}Create = O.Optional<O.Omit<Hold${kind.name}Input, 'target'>, 'targetId'>;`,
        );
      });

      it('reads exactly as the same model written in .cerial', async () => {
        const [text, expected] = await Promise.all([read(`Hold${kind.name}`), twin(`Hold${kind.name}`)]);

        for (const name of [`Hold${kind.name}`, `Hold${kind.name}Input`, `Hold${kind.name}Where`]) {
          expect(declaration(text, name)).toBe(declaration(expected, name));
        }
      });

      it(`makes the target's own id ${kind.idRequired ? 'required' : 'optional'} in create`, async () => {
        const text = await read(`Tgt${kind.name}`);

        expect(declaration(text, `Tgt${kind.name}Input`)).toContain(`id${kind.idRequired ? '' : '?'}: `);
        expect(text.includes(`export type Tgt${kind.name}Create = Tgt${kind.name}Input;`)).toBe(kind.idRequired);
      });
    });
  }

  it('shows the union id as required in the generated create input, never optional', async () => {
    const text = await read('TgtUnion');

    expect(declaration(text, 'TgtUnionInput')).toContain('id: string | number;');
    expect(declaration(text, 'TgtUnionInput')).not.toContain('id?:');
    expect(text).toContain('export type TgtUnionCreate = TgtUnionInput;');
  });

  it('keeps an int target from reading as a string key', async () => {
    const text = await read('HoldInt');

    expect(declaration(text, 'HoldInt')).not.toContain('CerialId<string>');
  });
});

describe('a .cerial relation to a TypeScript model with a typed id', () => {
  const tsTargets = `${HEAD}\n${KINDS.map(
    (k) => `export const Tgt${k.name} = model('Tgt${k.name}', { id: ${k.builder}.id() });`,
  ).join('\n')}\n`;
  const holders = KINDS.map(
    (k) =>
      `model Hold${k.name} {\n  id Record(int) @id\n  targetId Record?\n  target Relation? @field(targetId) @model(Tgt${k.name})\n}\n`,
  ).join('\n');
  let read: (model: string) => Promise<string>;

  beforeAll(async () => {
    read = await generated({ 'targets.schema.ts': tsTargets, 'holders.cerial': holders });
  });

  for (const kind of KINDS) {
    it(`types the foreign key by a TypeScript ${kind.builder} id`, async () => {
      const text = await read(`Hold${kind.name}`);

      expect(declaration(text, `Hold${kind.name}`)).toContain(`targetId?: ${kind.output};`);
      expect(declaration(text, `Hold${kind.name}Input`)).toContain(`targetId?: ${kind.input};`);
    });
  }

  it("shows the target's union id as required in create", async () => {
    const text = await read('TgtUnion');

    expect(declaration(text, 'TgtUnionInput')).toContain('id: string | number;');
    expect(text).toContain('export type TgtUnionCreate = TgtUnionInput;');
  });
});

describe('the explicit foreign key name across the boundary', () => {
  it('names the key of a TypeScript relation to a .cerial model, typed by the target', async () => {
    const read = await generated({
      't.cerial': 'model Writer {\n  id Record(int) @id\n}\n',
      'h.schema.ts': `${HEAD}import { Writer } from './cerial/handles';\nexport const Post = model('Post', { id: f.record('int').id(), approver: f.relation(Writer).optional().field('approvedBy') });\n`,
    });
    const text = await read('Post');

    expect(declaration(text, 'Post')).toContain('approvedBy?: CerialId<number>;');
    expect(declaration(text, 'PostInput')).toContain('approvedBy?: RecordIdInput<number>;');
    expect(declaration(text, 'Post')).not.toContain('approverId');
  });

  it('names the key of a .cerial relation to a TypeScript model, typed by the target', async () => {
    const read = await generated({
      't.schema.ts': `${HEAD}\nexport const Writer = model('Writer', { id: f.record('string', 'int').id() });\n`,
      'h.cerial':
        'model Post {\n  id Record(int) @id\n  approvedBy Record?\n  approver Relation? @field(approvedBy) @model(Writer)\n}\n',
    });
    const text = await read('Post');

    expect(declaration(text, 'Post')).toContain('approvedBy?: CerialId<string | number>;');
    expect(declaration(text, 'PostInput')).toContain('approvedBy?: RecordIdInput<string | number>;');
    expect(declaration(text, 'Post')).not.toContain('approverId');
  });
});
