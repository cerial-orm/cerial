import { describe, expect, test } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import { dslHandleInfo, f, handle, isDslHandle, model } from '../../../../src/parser/builder';
import { loadDeclarations } from '../../../../src/parser/builder/load';
import type { ModuleImporter } from '../../../../src/parser/builder/load';
import { materialise } from '../../../../src/parser/builder/materialise';
import { extendsOf } from '../../../../src/parser/builder';

describe('handle', () => {
  test('each form carries its name, kind and member names', () => {
    const User = handle.model('User', { members: ['id', 'name'], id: ['int'] });
    const Address = handle.object('Address', { members: ['street', 'city'] });
    const Point = handle.tuple('Point', { members: ['x', 'y'], size: 3 });
    const Role = handle.enum('Role', ['Admin', 'Guest']);
    const Level = handle.literal('Level', { variants: ["'low'", '1', 'Int'], simple: true });

    expect(User.name).toBe('User');
    expect(dslHandleInfo(User)).toEqual({ kind: 'model', name: 'User', members: ['id', 'name'], idTypes: ['int'] });
    expect(dslHandleInfo(Address)).toMatchObject({ kind: 'object', members: ['street', 'city'] });
    expect(dslHandleInfo(Point)).toMatchObject({ kind: 'tuple', members: ['x', 'y'], size: 3 });
    expect(dslHandleInfo(Role)).toMatchObject({ kind: 'enum', members: ['Admin', 'Guest'] });
    expect(dslHandleInfo(Level)).toMatchObject({ kind: 'literal', members: ["'low'", '1', 'Int'] });
  });

  test('a model without an id declares no id types', () => {
    expect(dslHandleInfo(handle.model('Plain', { members: ['a'] }))?.idTypes).toBeUndefined();
  });

  test('a handle is frozen and reusable as a parent', () => {
    const User = handle.model('User', { members: ['id'] });

    expect(Object.isFrozen(User)).toBe(true);
    const Child = model('Child', { id: f.record().id() }, { extends: User.pick('id') });

    expect(extendsOf(Child)?.parent).toBe(User);
  });

  test('isDslHandle recognises only DSL handles', () => {
    expect(isDslHandle(handle.object('Address', { members: [] }))).toBe(true);
    expect(isDslHandle(model('User', { id: f.record().id() }))).toBe(false);
    expect(isDslHandle({ name: 'User' })).toBe(false);
    expect(isDslHandle(null)).toBe(false);
    expect(isDslHandle('User')).toBe(false);
    expect(dslHandleInfo({ name: 'User' })).toBeUndefined();
  });

  test('a name or member that is not an identifier is refused', () => {
    expect(() => handle.model('a b', { members: [] })).toThrow(CerialGenerationError);
    expect(() => handle.model('User', { members: ['bad name'] })).toThrow(CerialGenerationError);
    expect(() => handle.object('Address', { members: ['x-y'] })).toThrow(CerialGenerationError);
    expect(() => handle.tuple('Point', { members: ['1x'], size: 1 })).toThrow(CerialGenerationError);
    expect(() => handle.enum('Role', ['Ad min'])).toThrow(CerialGenerationError);
    expect(() => handle.literal('1Level', { variants: [], simple: true })).toThrow(CerialGenerationError);
  });

  test('a literal variant identity keeps its quotes', () => {
    expect(handle.literal('Level', { variants: ["'a b'"], simple: true }).name).toBe('Level');
  });
});

describe('a DSL handle is not a declaration', () => {
  test('a schema module that re-exports one adds nothing to generation', async () => {
    const User = model('User', { id: f.record().id() });
    const Remote = handle.model('Remote', { members: ['id'] });
    const importModule: ModuleImporter = async () => ({
      User,
      Remote,
      Role: handle.enum('Role', ['A']),
      Level: handle.literal('Level', { variants: ['1'], simple: true }),
      Point: handle.tuple('Point', { members: [], size: 0 }),
      Address: handle.object('Address', { members: [] }),
    });

    const found = await loadDeclarations(['/virtual/a.schema.ts'], { importModule });

    expect(found.map((d) => d.exportName)).toEqual(['User']);
    expect(materialise(found).models.map((m) => m.name)).toEqual(['User']);
  });
});
