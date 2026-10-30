import { describe, expect, test } from 'bun:test';
import { f } from '../../../../src/parser/builder';
import { model, modelNode } from '../../../../src/parser/builder/model';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { parse } from '../../../../src/parser/parser';
import type { ASTModel } from '../../../../src/types';
import { withoutPosition } from './helpers';

function parsedModels(source: string): ASTModel[] {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast.models;
}

describe('model builder', () => {
  test('returns a handle carrying only the name', () => {
    const User = model('User', { id: f.record().id() });

    expect(User.name).toBe('User');
    expect(Object.keys(User)).toEqual(['name']);
  });

  test('a plain model matches the parser, with directives [] and no abstract key', () => {
    const node = modelNode(model('User', { id: f.record().id(), name: f.string(), age: f.int().optional() }));
    const [parsed] = parsedModels(`model User {
  id Record @id
  name String
  age Int?
}`);

    expect(node.directives).toEqual([]);
    expect('abstract' in node).toBe(false);
    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
    expect(withoutPosition(node)).toEqual(withoutPosition(parsed));
  });

  test('keeps field order', () => {
    const node = modelNode(model('M', { b: f.int(), a: f.int(), c: f.int() }));

    expect(node.fields.map((x) => x.name)).toEqual(['b', 'a', 'c']);
  });

  test('abstract: true writes abstract and matches the parser', () => {
    const node = modelNode(model('Base', { id: f.record().id(), name: f.string() }, { abstract: true }));
    const [parsed] = parsedModels(`abstract model Base {
  id Record @id
  name String
}`);

    expect(node.abstract).toBe(true);
    expect(node.directives).toEqual([]);
    expect(withoutPosition(node)).toEqual(withoutPosition(parsed));
  });

  test('abstract: false writes no abstract key', () => {
    const node = modelNode(model('M', { id: f.record().id() }, { abstract: false }));

    expect('abstract' in node).toBe(false);
  });

  test('an empty options object writes no abstract key', () => {
    expect('abstract' in modelNode(model('M', {}, {}))).toBe(false);
  });

  test('an abstract model goes through inheritance resolution as its parsed twin does', () => {
    const source = `abstract model Base {
  id Record @id
  name String
}
`;
    const { ast } = parse(source);
    const built = {
      ...ast,
      models: [modelNode(model('Base', { id: f.record().id(), name: f.string() }, { abstract: true }))],
    };

    const resolvedBuilt = resolveInheritance(built);
    const resolvedParsed = resolveInheritance(ast);

    expect(resolvedBuilt.models[0]!.abstract).toBe(true);
    expect(withoutPosition(resolvedBuilt.models)).toEqual(withoutPosition(resolvedParsed.models));
  });

  test('a non-abstract model resolves without the abstract flag', () => {
    const resolved = resolveInheritance({
      ...parse('model M {\n  id Record @id\n}\n').ast,
      models: [modelNode(model('M', { id: f.record().id() }))],
    });

    expect('abstract' in resolved.models[0]!).toBe(false);
  });

  test('modelNode refuses a value that is not a model handle', () => {
    expect(() => modelNode({ name: 'User' })).toThrow('Not a model handle');
  });

  test('a bare-string extends is a type error and refused at declaration', () => {
    // @ts-expect-error 'extends' takes a handle, not a name
    expect(() => model('M', {}, { extends: 'Base' })).toThrow("'extends' takes a model or object handle");
  });
});
