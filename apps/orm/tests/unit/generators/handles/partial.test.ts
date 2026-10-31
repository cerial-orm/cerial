import { describe, expect, it } from 'bun:test';
import { emitHandles, withoutErroredDeclarations } from '../../../../src/generators/handles';
import {
  collectEnumNames,
  collectLiteralNames,
  collectObjectNames,
  collectTupleNames,
  parse,
} from '../../../../src/parser/parser';
import { lineOf } from './helpers';

const SOURCE = `model Good {
  id Record @id
  name String
}
model UsesTs {
  id Record @id
  address TsAddress
}
model Kid extends UsesTs {
  extra String
}
object Fine {
  a Int
}
`;

function pass1(source: string) {
  return parse(
    source,
    new Set(collectObjectNames(source)),
    new Set(collectTupleNames(source)),
    new Set(collectLiteralNames(source)),
    new Set(collectEnumNames(source)),
    'p.cerial',
  );
}

describe('withoutErroredDeclarations', () => {
  const parsed = pass1(SOURCE);

  it('sees the failing reference to a TypeScript-declared type as a parse error', () => {
    expect(parsed.errors.length).toBe(1);
  });

  it('keeps the declarations that parsed whole', () => {
    const text = emitHandles(withoutErroredDeclarations(parsed.ast, parsed.errors));
    expect(lineOf(text, 'Good')).toContain('members: ["id", "name"]');
    expect(lineOf(text, 'Fine')).toContain('handle.object');
  });

  it('drops the declaration that lost a field, and its children, instead of listing too few members', () => {
    const text = emitHandles(withoutErroredDeclarations(parsed.ast, parsed.errors));
    expect(text).not.toContain('export const UsesTs');
    expect(text).not.toContain('export const Kid');
  });

  it('returns the AST untouched when there is no error', () => {
    const clean = pass1('model A {\n  id Record @id\n}');
    expect(withoutErroredDeclarations(clean.ast, clean.errors)).toBe(clean.ast);
  });
});
