import { describe, expect, it } from 'bun:test';
import { collectDslNames, runPassThree, unionNames } from '../../../../src/cli/passes';

const USES_MONEY = 'model Order {\n  id Record(int) @id\n  total Money\n}\n';
const NO_SETS = {
  objects: new Set<string>(),
  tuples: new Set<string>(),
  literals: new Set<string>(),
  enums: new Set<string>(),
};

describe('runPassThree', () => {
  it('parses against the .cerial names of every file', () => {
    const result = runPassThree([
      { path: 'a.cerial', content: 'model User {\n  id Record(int) @id\n  home Address\n}\n' },
      { path: 'b.cerial', content: 'object Address {\n  city String\n}\n' },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.ast.models.map((m) => m.name)).toEqual(['User']);
    expect(result.ast.objects.map((o) => o.name)).toEqual(['Address']);
    expect(result.ast.source).toBe('');
  });

  it('reports a type that no name set declares, with its file and line', () => {
    const result = runPassThree([{ path: 'a.cerial', content: USES_MONEY }]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^a\.cerial:3: /);
  });

  it('resolves a type declared elsewhere once its name is passed in', () => {
    for (const kind of ['objects', 'tuples', 'literals', 'enums'] as const) {
      const declared = { ...NO_SETS, [kind]: new Set(['Money']) };

      const result = runPassThree([{ path: 'a.cerial', content: USES_MONEY }], declared);

      expect(result.errors).toEqual([]);
      expect(result.ast.models.map((m) => m.name)).toEqual(['Order']);
    }
  });

  it('keeps the files that parsed and drops the one that did not', () => {
    const result = runPassThree([
      { path: 'bad.cerial', content: USES_MONEY },
      { path: 'good.cerial', content: 'model Post {\n  id Record(int) @id\n}\n' },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.ast.models.map((m) => m.name)).toEqual(['Post']);
  });
});

describe('name sets', () => {
  it('collects declared names by kind', () => {
    const names = collectDslNames([
      { path: 'a.cerial', content: 'object A {\n  x String\n}\ntuple T {\n  Int,\n  Int\n}\n' },
      { path: 'b.cerial', content: "enum E { 'a', 'b' }\n" },
    ]);

    expect([...names.objects]).toEqual(['A']);
    expect([...names.tuples]).toEqual(['T']);
    expect([...names.enums]).toEqual(['E']);
    // An enum is also collected as a literal name, which is how a field typed by one resolves
    expect([...names.literals]).toEqual(['E']);
  });

  it('unions without changing either input', () => {
    const a = { ...NO_SETS, objects: new Set(['A']) };
    const b = { ...NO_SETS, objects: new Set(['B']), enums: new Set(['E']) };

    const both = unionNames(a, b);

    expect([...both.objects].sort()).toEqual(['A', 'B']);
    expect([...both.enums]).toEqual(['E']);
    expect([...a.objects]).toEqual(['A']);
  });
});
