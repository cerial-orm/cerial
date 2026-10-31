import { describe, expect, it } from 'bun:test';
import { emitHandles } from '../../../../src/generators/handles';
import { lineOf, parseSchema } from './helpers';

describe('emitHandles tuples', () => {
  it('lists named elements and the size of a fully named tuple', () => {
    const text = emitHandles(parseSchema('tuple Point {\n  x Float,\n  y Float\n}'));
    expect(lineOf(text, 'Point')).toContain('members: ["x", "y"], size: 2');
  });

  it('lists no names for a positional tuple but still gives its size', () => {
    const text = emitHandles(parseSchema('tuple Pair {\n  Int,\n  String,\n  Bool\n}'));
    expect(lineOf(text, 'Pair')).toContain('members: [], size: 3');
  });

  it('lists only the named elements of a mixed tuple, counting every position in size', () => {
    const text = emitHandles(parseSchema('tuple Mixed {\n  Int,\n  label String,\n  Bool\n}'));
    expect(lineOf(text, 'Mixed')).toContain('members: ["label"], size: 3');
  });

  it('includes inherited elements and a private named element', () => {
    const text = emitHandles(
      parseSchema(`
tuple Base {
  a Int,
  hidden Int !!private
}
tuple Child extends Base {
  b Int
}
`),
    );
    expect(lineOf(text, 'Base')).toContain('private: ["hidden"]');
    expect(lineOf(text, 'Child')).toContain('members: ["a", "hidden", "b"], size: 3');
  });
});

describe('emitHandles literals', () => {
  it('gives the identity of every simple variant kind', () => {
    const text = emitHandles(parseSchema("literal Mixed {\n  'low',\n  7,\n  1.5,\n  true,\n  String\n}"));
    const line = lineOf(text, 'Mixed');
    expect(line).toContain(`variants: ["'low'", "7", "1.5", "true", "String"], simple: true`);
  });

  it('marks a literal holding an object, tuple or literal reference as not simple', () => {
    const text = emitHandles(
      parseSchema(`
object Box {
  a Int
}
tuple Duo {
  Int,
  Int
}
literal Inner {
  'x'
}
literal WithObject {
  Box,
  'y'
}
literal WithTuple {
  Duo
}
literal WithLiteral {
  Inner
}
`),
    );
    expect(lineOf(text, 'WithObject')).toContain(`variants: ["Box", "'y'"], simple: false`);
    expect(lineOf(text, 'WithTuple')).toContain('simple: false');
    expect(lineOf(text, 'WithLiteral')).toContain(`variants: ["Inner"], simple: false`);
    expect(lineOf(text, 'Inner')).toContain('simple: true');
  });

  it('includes inherited variants and enum values', () => {
    const text = emitHandles(
      parseSchema(`
literal Base {
  'a',
  'b'
}
literal Child extends Base {
  'c'
}
enum Roles {
  A
  B
}
enum MoreRoles extends Roles {
  C
}
`),
    );
    expect(lineOf(text, 'Child')).toContain(`variants: ["'a'", "'b'", "'c'"]`);
    expect(lineOf(text, 'MoreRoles')).toContain('["A", "B", "C"]');
  });
});
