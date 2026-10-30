import { describe, expect, test } from 'bun:test';
import { f, model, modelNode, object, objectNode } from '../../../../src/parser/builder';
import type { Extendable } from '../../../../src/parser/builder';
import { validateExtends } from '../../../../src/cli/validators/extends-validator';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { parse } from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

const Root = model(
  'Root',
  { id: f.record().id().private(), secret: f.string().private(), name: f.string(), age: f.int().optional() },
  { abstract: true },
);
// Level two drops `secret`; level three leaves it dropped.
const Mid = model('Mid', { token: f.string().optional().private() }, { abstract: true, extends: Root.omit('secret') });
const Leaf = model('Leaf', { extra: f.int() }, { abstract: true, extends: Mid });

const SOURCE = `abstract model Root {
  id Record @id !!private
  secret String !!private
  name String
  age Int?
}

abstract model Mid extends Root[!secret] {
  token String? !!private
}

abstract model Leaf extends Mid {
  extra Int
}

model OmitsPrivate extends Root[!id, !secret] {
}

model PicksWithout extends Root[name, age] {
}

model PicksPrivate extends Root[id, name] {
}

model DeepOmit extends Leaf[!extra] {
}
`;

function builtAst(models: ReturnType<typeof modelNode>[]): SchemaAST {
  const { ast } = parse('');

  return { ...ast, models };
}

describe('!!private on a built field', () => {
  test('is written on the node whichever order the calls come in', () => {
    const node = modelNode(
      model('M', { a: f.string().private().optional(), b: f.string().optional().private(), c: f.string() }),
    );

    expect(node.fields.map((field) => field.isPrivate)).toEqual([true, true, undefined]);
  });

  test('an object field can be private too', () => {
    expect(objectNode(object('O', { a: f.string().private() })).fields[0]!.isPrivate).toBe(true);
  });
});

describe('!!private under extends', () => {
  const built = [
    Root,
    Mid,
    Leaf,
    model('OmitsPrivate', {}, { extends: Root.omit('id', 'secret') }),
    model('PicksWithout', {}, { extends: Root.pick('name', 'age') }),
    model('PicksPrivate', {}, { extends: Root.pick('id', 'name') }),
    model('DeepOmit', {}, { extends: Leaf.omit('extra') }),
  ].map((handle) => modelNode(handle));

  test('omitting a private field, picking without it and picking it all build and validate', () => {
    expect(validateExtends(builtAst(built))).toEqual([]);
  });

  test('matches the parser for the same schema, raw and resolved', () => {
    const { ast, errors } = parse(SOURCE);
    expect(errors).toHaveLength(0);
    const twin = builtAst(built);

    expect(withoutPosition(twin.models)).toEqual(withoutPosition(ast.models));
    expect(withoutPosition(resolveInheritance(twin).models)).toEqual(withoutPosition(resolveInheritance(ast).models));
  });

  test('a redeclared private field that reaches the builder through a loose type is still refused at runtime', () => {
    // The loose handle drops the reserved names from the type, as a handle read from untyped code would.
    const loose = Root as unknown as Extendable;
    const direct = modelNode(model('Direct', { id: f.record().id() }, { extends: loose }));
    // `secret` was dropped at Mid, but a name an intermediate dropped stays reserved for its descendants.
    const transitive = modelNode(
      model('Transitive', { secret: f.string() }, { extends: Mid as unknown as Extendable }),
    );
    const errors = validateExtends(builtAst([...built, direct, transitive]));

    expect(errors.map((error) => error.message)).toEqual([
      expect.stringContaining('Field "id" in model "Direct" overrides a private field from parent "Root"'),
      expect.stringContaining('Field "secret" in model "Transitive" overrides a private field from parent "Root"'),
    ]);
  });

  test('a private field of an object is refused the same way', () => {
    const Address = object('Address', { street: f.string().private(), city: f.string() });
    const Road = object('Road', { street: f.string() }, { extends: Address as unknown as Extendable });
    const { ast } = parse('');
    const errors = validateExtends({ ...ast, objects: [objectNode(Address), objectNode(Road)] });

    expect(errors.map((error) => error.message)).toEqual([
      expect.stringContaining('Field "street" in object "Road" overrides a private field from parent "Address"'),
    ]);
  });

  test('a non-private parent field can still be redeclared', () => {
    const child = model('Over', { name: f.string().optional() }, { extends: Root.pick('name') });

    expect(validateExtends(builtAst([...built, modelNode(child)]))).toEqual([]);
  });
});
