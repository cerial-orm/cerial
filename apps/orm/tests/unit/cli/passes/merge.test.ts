import { describe, expect, it } from 'bun:test';
import { mergeDeclarations } from '../../../../src/cli/passes';
import type { Origin, SchemaAST } from '../../../../src/types';
import { emptyAst } from '../../../../src/cli/passes';

const range = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
const dsl = (file: string): Origin => ({ kind: 'dsl', file, range });
const ts = (file: string): Origin => ({ kind: 'ts', file, export: 'x' });

function model(name: string, origin: Origin): SchemaAST['models'][number] {
  return { name, fields: [], directives: [], range, origin };
}

function object(name: string, origin: Origin): SchemaAST['objects'][number] {
  return { name, fields: [], range, origin };
}

const dslHalf: SchemaAST = {
  ...emptyAst(),
  models: [model('B', dsl('/p/b.cerial')), model('A2', dsl('/p/a.cerial')), model('A1', dsl('/p/a.cerial'))],
  objects: [object('Shared', dsl('/p/b.cerial'))],
};
const tsHalf: SchemaAST = {
  ...emptyAst(),
  models: [model('T', ts('/p/a.schema.ts'))],
  objects: [object('Shared', ts('/p/c.schema.ts')), object('Own', ts('/p/a.schema.ts'))],
};

describe('mergeDeclarations', () => {
  it('is equal whichever half arrives first', () => {
    expect(mergeDeclarations(dslHalf, tsHalf)).toEqual(mergeDeclarations(tsHalf, dslHalf));
  });

  it('orders by file path and keeps declaration order within a file', () => {
    const merged = mergeDeclarations(dslHalf, tsHalf);

    expect(merged.models.map((m) => m.name)).toEqual(['A2', 'A1', 'T', 'B']);
    expect(merged.objects.map((o) => o.origin.file)).toEqual(['/p/a.schema.ts', '/p/b.cerial', '/p/c.schema.ts']);
  });

  it('renames and deduplicates nothing, so a repeated name reaches the validator', () => {
    const merged = mergeDeclarations(dslHalf, tsHalf);

    expect(merged.objects.map((o) => o.name)).toEqual(['Own', 'Shared', 'Shared']);
  });

  it('joins all five arrays and leaves source empty', () => {
    const merged = mergeDeclarations({ ...emptyAst(), source: 'x' }, emptyAst());

    expect(Object.keys(merged).sort()).toEqual(['enums', 'literals', 'models', 'objects', 'source', 'tuples']);
    expect(merged.source).toBe('');
  });

  it('does not change either half', () => {
    const before = structuredClone(dslHalf);

    mergeDeclarations(dslHalf, tsHalf);

    expect(dslHalf).toEqual(before);
  });
});
