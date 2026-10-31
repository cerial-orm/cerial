/**
 * Unit Tests: validator errors carry the origin of the node they report
 *
 * Every declaration kind and field form is run through the checks `cerial generate` runs, once as
 * parsed `.cerial` text and once with every origin rewritten to a TypeScript declaration.
 */

import { describe, expect, test } from 'bun:test';
import { formatOrigin, NO_LINE, validateResolvedTypes } from '../../../src/cli/validators';
import { parse } from '../../../src/parser/parser';
import type { Origin, SchemaAST } from '../../../src/types';
import { validateAll } from './helpers';

interface Case {
  name: string;
  source: string;
  /** Start line the first error must report for the `.cerial` form */
  line: number;
  /** Declaration the error must name for the TypeScript form */
  exportName: string;
}

const cases: Case[] = [
  { name: 'reserved model name', source: 'model Select {\n  id Record @id\n}', line: 1, exportName: 'Select' },
  {
    name: 'reserved field on a model',
    source: 'model User {\n  id Record @id\n  type String\n}',
    line: 3,
    exportName: 'User',
  },
  { name: 'reserved object name', source: 'object Group {\n  label String\n}', line: 1, exportName: 'Group' },
  { name: 'reserved field on an object', source: 'object Place {\n  order Int\n}', line: 2, exportName: 'Place' },
  { name: 'reserved tuple name', source: 'tuple Table {\n  Int,\n  Int\n}', line: 1, exportName: 'Table' },
  { name: 'reserved enum name', source: 'enum Value { A }', line: 1, exportName: 'Value' },
  { name: 'duplicate enum value', source: 'enum Role { A, B, A }', line: 1, exportName: 'Role' },
  {
    name: 'optional tuple element',
    source: 'tuple Pair {\n  Int?,\n  Int\n}',
    line: 1,
    exportName: 'Pair',
  },
  {
    name: 'literal over a nested object',
    source: "object Inner {\n  x Int\n}\nobject Outer {\n  inner Inner\n}\nliteral Pick { 'none', Outer }",
    line: 7,
    exportName: 'Pick',
  },
  {
    name: 'two @id fields',
    source: 'model User {\n  id Record @id\n  other String @id\n}',
    line: 3,
    exportName: 'User',
  },
  {
    name: 'relation to a missing model',
    source: 'model Post {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(Nope)\n}',
    line: 4,
    exportName: 'Post',
  },
  {
    name: 'composite directive repeating a field',
    source: 'model User {\n  id Record @id\n  name String\n  @@unique(dup, [name, name])\n}',
    line: 4,
    exportName: 'User',
  },
  {
    name: 'nullable on an object field',
    source: 'object Address {\n  city String\n}\nmodel User {\n  id Record @id\n  home Address @nullable\n}',
    line: 6,
    exportName: 'User',
  },
  {
    name: 'extends a missing model',
    source: 'model A extends Nope {\n  id Record @id\n}',
    line: 1,
    exportName: 'A',
  },
  {
    name: 'circular object extends',
    source: 'object A extends B {\n  x Int\n}\nobject B extends A {\n  y Int\n}',
    line: 1,
    exportName: 'A',
  },
  {
    name: 'two models sharing a name',
    source: 'model User {\n  id Record @id\n}\nmodel User {\n  id Record @id\n}',
    line: 4,
    exportName: 'User',
  },
  {
    name: 'one name across kinds',
    source: 'model Thing {\n  id Record @id\n}\nenum Thing { A }',
    line: 4,
    exportName: 'Thing',
  },
];

function run(ast: SchemaAST) {
  return [...validateAll(ast), ...validateResolvedTypes(ast)];
}

/** Rewrite every origin to a TypeScript one; a field names the declaration that holds it */
function setExport(node: unknown, exportName: string): void {
  if (Array.isArray(node)) {
    for (const item of node) setExport(item, exportName);

    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if ('origin' in record) record.origin = { kind: 'ts', file: 'schema.ts', export: exportName } satisfies Origin;
  for (const [key, value] of Object.entries(record)) if (key !== 'origin') setExport(value, exportName);
}

function toTypeScript(ast: SchemaAST): void {
  for (const group of [ast.models, ast.objects, ast.tuples, ast.enums, ast.literals])
    for (const declaration of group) setExport(declaration, declaration.name);
}

describe('validator errors carry the origin of the node they report', () => {
  for (const c of cases) {
    describe(c.name, () => {
      test('a .cerial source gives an error with its dsl origin and exact line', () => {
        const errors = run(parse(c.source, new Set(), new Set(), new Set(), new Set(), 'a.cerial').ast);

        expect(errors.length).toBeGreaterThan(0);
        for (const error of errors) {
          expect(error.origin?.kind).toBe('dsl');
          if (error.origin?.kind === 'dsl') expect(error.line).toBe(error.origin.range.start.line);
        }
        expect(errors[0]?.line).toBe(c.line);
        expect(formatOrigin(errors[0]!.origin!)).toBe(`a.cerial:${c.line}`);
      });

      test('a TypeScript declaration gives an error that names the export and has no line', () => {
        const ast = parse(c.source, new Set(), new Set(), new Set(), new Set(), 'a.cerial').ast;
        toTypeScript(ast);
        const errors = run(ast);

        expect(errors.length).toBeGreaterThan(0);
        for (const error of errors) {
          expect(error.origin?.kind).toBe('ts');
          expect(error.line).toBe(NO_LINE);
        }
        expect(formatOrigin(errors[0]!.origin!)).toBe(`schema.ts (export ${c.exportName})`);
      });
    });
  }
});
