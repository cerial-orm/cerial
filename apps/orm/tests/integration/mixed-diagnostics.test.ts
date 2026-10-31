/**
 * A validator failure in a project mixing `.cerial` and TypeScript names the form the failing declaration was
 * written in: a `.cerial` file and line, or a module and export. Each validator family runs once with the
 * declaration authored in each form, on a real `generate`, and the whole message is compared. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

afterAll(removeMixedProjects);

const IMPORTS =
  "import { e, f, model, object, tuple } from 'cerial/schema';\nimport * as dsl from './cerial/handles';\n";
const ADDRESS_TS = "export const Address = object('Address', { street: f.string() });\n";
const ADDRESS_DSL = 'object Address {\n  street String\n}\n';

interface Case {
  readonly name: string;
  readonly files: Record<string, string>;
  /** The one error expected; `<dir>` stands for the temporary project directory */
  readonly message: string;
}

const NO_FIELDS = 'Check that the extends clause and pick/omit filters leave at least one field.';
const RESERVED = 'is a SurrealDB reserved word and cannot be used. Rename it.';

const FAMILIES: Array<{ family: string; cases: Case[] }> = [
  {
    family: 'extends (validateExtends)',
    cases: [
      {
        name: 'a pick of a missing field, authored in .cerial over a TypeScript parent',
        files: {
          'slim.cerial': 'object Slim extends Address[bogus] {\n  x Int\n}\n',
          'address.schema.ts': IMPORTS + ADDRESS_TS,
        },
        message: '<dir>/slim.cerial:1: object "Slim" pick references "bogus" which does not exist in parent "Address".',
      },
      {
        name: 'a pick of an out-of-range position, authored in TypeScript over a .cerial parent',
        files: {
          'dot.cerial': 'tuple Dot {\n  Float,\n  Float\n}\n',
          'far.schema.ts': `${IMPORTS}export const Far = tuple('Far', { z: e.float() }, { extends: dsl.Dot.pick('5') });\n`,
        },
        message:
          '<dir>/far.schema.ts (export Far): tuple "Far" pick references index "5" which is out of bounds in parent "Dot" (2 elements).',
      },
    ],
  },
  {
    family: 'resolved types (validateResolvedTypes)',
    cases: [
      {
        name: 'an object left empty, authored in .cerial over a TypeScript parent',
        files: {
          'bare.cerial': 'object Bare extends Address[!street] {\n}\n',
          'address.schema.ts': IMPORTS + ADDRESS_TS,
        },
        message: `<dir>/bare.cerial:1: Object "Bare" has no fields after inheritance resolution. ${NO_FIELDS}`,
      },
      {
        name: 'an object left empty, authored in TypeScript over a .cerial parent',
        files: {
          'plain.cerial': 'object Plain {\n  n Int\n}\n',
          'bare.schema.ts': `${IMPORTS}export const Bare = object('Bare', {}, { extends: dsl.Plain.omit('n') });\n`,
        },
        message: `<dir>/bare.schema.ts (export Bare): Object "Bare" has no fields after inheritance resolution. ${NO_FIELDS}`,
      },
    ],
  },
  {
    family: 'schema (validateSchema)',
    cases: [
      {
        name: 'a reserved field name, authored in .cerial over a TypeScript object',
        files: {
          'ledger.cerial': 'model Ledger {\n  id Record(int) @id\n  order Int\n  home Address\n}\n',
          'address.schema.ts': IMPORTS + ADDRESS_TS,
        },
        message: `<dir>/ledger.cerial:3: Reserved keyword: field (on model Ledger) name 'order' ${RESERVED}`,
      },
      {
        name: 'a reserved field name, authored in TypeScript over a .cerial object',
        files: {
          'address.cerial': ADDRESS_DSL,
          'ledger.schema.ts': `${IMPORTS}export const Ledger = model('Ledger', { id: f.record('int').id(), order: f.int(), home: f.object(dsl.Address) });\n`,
        },
        message: `<dir>/ledger.schema.ts (export Ledger): Reserved keyword: field (on model Ledger) name 'order' ${RESERVED}`,
      },
    ],
  },
  {
    family: 'a field inherited across the boundary',
    cases: [
      {
        name: 'a TypeScript child of a .cerial parent names the .cerial line of the parent field',
        files: {
          'base.cerial': 'abstract model Base {\n  id Record(int) @id\n  order Int\n}\n',
          'child.schema.ts': `${IMPORTS}export const Child = model('Child', { own: f.string() }, { extends: dsl.Base });\n`,
        },
        message: `<dir>/base.cerial:3: Reserved keyword: field (on model Child) name 'order' ${RESERVED}`,
      },
      {
        name: 'a .cerial child of a TypeScript parent names the parent export',
        files: {
          'base.schema.ts': `${IMPORTS}export const Base = model('Base', { id: f.record('int').id(), order: f.int() }, { abstract: true });\n`,
          'child.cerial': 'model Child extends Base {\n  own String\n}\n',
        },
        message: `<dir>/base.schema.ts (export Base): Reserved keyword: field (on model Child) name 'order' ${RESERVED}`,
      },
    ],
  },
];

describe('a validator failure in a mixed project', () => {
  for (const { family, cases } of FAMILIES) {
    describe(family, () => {
      for (const c of cases) {
        it(`names its origin: ${c.name}`, async () => {
          const dir = await mixedProject(c.files);
          const outputDir = join(dir, 'out');

          const result = await generateSingleSchema({ schemaPath: dir, outputDir, logLevel: 'minimal' });

          expect(result.success).toBe(false);
          expect(result.errors.map((error) => error.replaceAll(dir, '<dir>'))).toEqual([c.message]);
          expect(result.files).toEqual([]);
          expect(existsSync(outputDir)).toBe(false);
        });
      }
    });
  }
});
