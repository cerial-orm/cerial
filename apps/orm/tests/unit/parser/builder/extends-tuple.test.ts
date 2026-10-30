import { describe, expect, test } from 'bun:test';
import { e, extendsOf, tuple, tupleNode } from '../../../../src/parser/builder';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { validateExtends } from '../../../../src/cli/validators/extends-validator';
import { parse } from '../../../../src/parser/parser';
import { createSchemaAST } from '../../../../src/parser/types/ast';
import type { ASTTuple, SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast;
}

/** Raw, then resolved: the second is what the generator sees. */
function expectSameAsParsed(source: string, built: ASTTuple[]): void {
  const ast = parsed(source);
  const twin = { ...ast, tuples: built };

  expect(withoutPosition(twin.tuples)).toEqual(withoutPosition(ast.tuples));
  expect(withoutPosition(resolveInheritance(twin).tuples)).toEqual(withoutPosition(resolveInheritance(ast).tuples));
}

const Named = tuple('Named', { name: e.string(), age: e.int(), flag: e.bool().private() });
const Positional = tuple('Positional', [e.string(), e.int(), e.bool()]);

describe('tuple extends by name', () => {
  test('pick and omit write the names in order, and a plain extends writes no filter key', () => {
    const picked = tupleNode(tuple('P', {}, { extends: Named.pick('age', 'name') }));
    const omitted = tupleNode(tuple('O', {}, { extends: Named.omit('age') }));
    const plain = tupleNode(tuple('Plain', { more: e.bool() }, { extends: Named }));

    expect(picked.extends).toBe('Named');
    expect(picked.extendsFilter).toEqual({ mode: 'pick', fields: ['age', 'name'] });
    expect(omitted.extendsFilter).toEqual({ mode: 'omit', fields: ['age'] });
    expect(plain.extends).toBe('Named');
    expect('extendsFilter' in plain).toBe(false);
  });

  test('no extends writes neither key', () => {
    const node = tupleNode(tuple('Solo', [e.int()]));

    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
  });

  test('matches the parser for pick, omit, plain and appended elements, raw and resolved', () => {
    const Base = tuple('NamedBase', { name: e.string(), age: e.int(), active: e.bool() });
    const source = `tuple NamedBase { name String, age Int, active Bool }
tuple PickedName extends NamedBase[name, age] { }
tuple OmittedAge extends NamedBase[!age] { }
tuple Plain extends NamedBase { extra Float }
tuple PickedPlus extends NamedBase[name] { extra Float }`;
    expectSameAsParsed(source, [
      tupleNode(Base),
      tupleNode(tuple('PickedName', {}, { extends: Base.pick('name', 'age') })),
      tupleNode(tuple('OmittedAge', {}, { extends: Base.omit('age') })),
      tupleNode(tuple('Plain', { extra: e.float() }, { extends: Base })),
      tupleNode(tuple('PickedPlus', { extra: e.float() }, { extends: Base.pick('name') })),
    ]);
  });
});

describe('tuple extends by index', () => {
  test('numbers are stored as the decimal digit strings the parser stores', () => {
    const picked = tupleNode(tuple('P', [], { extends: Positional.pick(0, 1) }));
    const omitted = tupleNode(tuple('O', [], { extends: Positional.omit(1) }));

    expect(picked.extendsFilter).toEqual({ mode: 'pick', fields: ['0', '1'] });
    expect(omitted.extendsFilter).toEqual({ mode: 'omit', fields: ['1'] });
  });

  test('a named parent can also be listed by position', () => {
    const node = tupleNode(tuple('P', {}, { extends: Named.pick(1) }));

    expect(node.extendsFilter).toEqual({ mode: 'pick', fields: ['1'] });
  });

  test('matches the parser for the extends-tuple corpus forms, raw and resolved', () => {
    const Base = tuple('ExtBasePair', [e.string(), e.int()]);
    const source = `tuple ExtBasePair { String, Int }
tuple ExtFirstTwo extends ExtBasePair[0, 1] { }
tuple ExtWithoutSecond extends ExtBasePair[!1] { }
tuple ExtAppended extends ExtBasePair[0] { Bool }`;
    expectSameAsParsed(source, [
      tupleNode(Base),
      tupleNode(tuple('ExtFirstTwo', [], { extends: Base.pick(0, 1) })),
      tupleNode(tuple('ExtWithoutSecond', [], { extends: Base.omit(1) })),
      tupleNode(tuple('ExtAppended', [e.bool()], { extends: Base.pick(0) })),
    ]);
  });

  test('names and positions mix in one list, as the parser and validator allow', () => {
    const Base = tuple('Mix', { name: e.string(), age: e.int(), flag: e.bool() });
    const source = `tuple Mix { name String, age Int, flag Bool }
tuple Mixed extends Mix[name, 2] { }
tuple MixedOut extends Mix[!0, !age] { }`;
    expectSameAsParsed(source, [
      tupleNode(Base),
      tupleNode(tuple('Mixed', {}, { extends: Base.pick('name', 2) })),
      tupleNode(tuple('MixedOut', {}, { extends: Base.omit(0, 'age') })),
    ]);
  });
});

describe('refusals left to the schema', () => {
  test('an out-of-range position builds and is refused by the validator and the resolver', () => {
    const child = tupleNode(tuple('Far', [], { extends: Positional.pick(7) }));
    const ast = createSchemaAST([], '', [], [tupleNode(Positional), child]);

    expect(child.extendsFilter).toEqual({ mode: 'pick', fields: ['7'] });
    expect(validateExtends(ast).map((error) => error.message)).toEqual([expect.stringContaining('out of bounds')]);
    expect(() => resolveInheritance(ast)).toThrow(/nonexistent element '7'/);
  });

  test('a private element cannot be overridden by name, though it may be omitted or left unpicked', () => {
    const override = tupleNode(tuple('Over', { flag: e.bool() }, { extends: Named } as never));
    const ast = createSchemaAST([], '', [], [tupleNode(Named), override]);
    const messages = validateExtends(ast).map((error) => error.message);

    expect(messages).toEqual([expect.stringContaining('private element')]);
    for (const clause of [Named.omit('flag'), Named.pick('name')]) {
      const child = tupleNode(tuple('Free', {}, { extends: clause }));
      const clean = createSchemaAST([], '', [], [tupleNode(Named), child]);

      expect(validateExtends(clean)).toEqual([]);
    }
  });

  test('extendsOf walks from the child to its raw parent', () => {
    const child = tuple('Walk', {}, { extends: Named.pick(0) });

    expect(extendsOf(child)?.parent).toBe(Named);
  });
});
