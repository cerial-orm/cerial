/**
 * Unit tests for generateFindUniqueWhereType in method-generator.ts: id, single unique,
 * composite unique and object @unique variants, asserted as exact emitted text.
 */

import { describe, expect, test } from 'bun:test';
import { generateFindUniqueWhereType } from '../../../../src/generators/types/method-generator';
import type { CompositeIndex, ObjectRegistry } from '../../../../src/types';
import { field, literalField, literalInfo, model, object, objectField } from '../fixtures';

const id = field({ name: 'id', type: 'record', isId: true });
const unique = (v: string) => field({ name: v, isUnique: true });
const composite = (name: string, fields: string[], kind: CompositeIndex['kind'] = 'unique'): CompositeIndex => ({
  name,
  kind,
  fields,
});
const where = (fields: Parameters<typeof model>[1], extra: Parameters<typeof model>[2] = {}, reg?: ObjectRegistry) =>
  generateFindUniqueWhereType(model('User', fields, extra), reg);

describe('id and single-field unique variants', () => {
  test('a model with nothing unique emits no type', () => {
    expect(where([field({ name: 'name' })])).toBe('');
  });

  test('id only', () => {
    expect(where([id])).toBe(
      `export type UserFindUniqueWhere = ({ id: RecordIdInput<string> } & Omit<UserWhere, 'id'>);`,
    );
  });

  test('typed id uses its raw type', () => {
    const typed = field({ name: 'id', type: 'record', isId: true, recordIdTypes: ['int'] });

    expect(where([typed])).toContain('{ id: RecordIdInput<number> }');
  });

  test('union id emits a union input', () => {
    const typed = field({ name: 'id', type: 'record', isId: true, recordIdTypes: ['string', 'int'] });

    expect(where([typed])).toContain('{ id: RecordIdInput<string | number> }');
  });

  test('unique field without an id', () => {
    expect(where([unique('email')])).toBe(
      `export type UserFindUniqueWhere = ({ email: string } & Omit<UserWhere, 'email'>);`,
    );
  });

  test('id and unique field produce two variants, each optionally accepting the other', () => {
    expect(where([id, unique('email')])).toBe(
      `export type UserFindUniqueWhere = ({ id: RecordIdInput<string> } & { email?: string } & Omit<UserWhere, 'id' | 'email'>)\n` +
        `  | ({ email: string } & { id?: RecordIdInput<string> } & Omit<UserWhere, 'id' | 'email'>);`,
    );
  });

  test('three unique fields: each variant lists the other two as optional', () => {
    expect(where([unique('a'), unique('b'), unique('c')])).toBe(
      `export type UserFindUniqueWhere = ({ a: string } & { b?: string; c?: string } & Omit<UserWhere, 'a' | 'b' | 'c'>)\n` +
        `  | ({ b: string } & { a?: string; c?: string } & Omit<UserWhere, 'a' | 'b' | 'c'>)\n` +
        `  | ({ c: string } & { a?: string; b?: string } & Omit<UserWhere, 'a' | 'b' | 'c'>);`,
    );
  });

  test('a unique id field is not emitted twice', () => {
    const uniqueId = field({ name: 'id', type: 'record', isId: true, isUnique: true });

    expect(where([uniqueId])).toBe(
      `export type UserFindUniqueWhere = ({ id: RecordIdInput<string> } & Omit<UserWhere, 'id'>);`,
    );
  });

  test('unique non-id Record field uses RecordIdInput', () => {
    const ref = field({ name: 'ownerId', type: 'record', isUnique: true });

    expect(where([ref])).toContain('{ ownerId: RecordIdInput<string> }');
  });

  test('unique object-typed field uses the object name', () => {
    expect(where([objectField('home', 'Address', { isUnique: true })])).toBe(
      `export type UserFindUniqueWhere = ({ home: Address } & Omit<UserWhere, 'home'>);`,
    );
  });

  test('unique literal and enum fields fall back to unknown (no literal-specific input type)', () => {
    const lit = literalField('status', literalInfo('Status', [], false));
    const en = literalField('role', literalInfo('Role', [], true));

    expect(where([{ ...lit, isUnique: true }])).toContain('{ status: unknown }');
    expect(where([{ ...en, isUnique: true }])).toContain('{ role: unknown }');
  });
});

describe('composite unique variants', () => {
  test('required fields: JSDoc has no warning block', () => {
    const m = [field({ name: 'a' }), field({ name: 'b', type: 'int' })];

    expect(where(m, { compositeDirectives: [composite('ab', ['a', 'b'])] })).toBe(
      `export type UserFindUniqueWhere = (  /**\n   * Composite unique index on fields: a, b\n   */\n` +
        `  { ab: { a: string; b: number } } & Omit<UserWhere, 'ab'>);`,
    );
  });

  test('an optional field gets a null suffix and the warning table', () => {
    const m = [field({ name: 'a' }), field({ name: 'b', isRequired: false })];

    expect(where(m, { compositeDirectives: [composite('ab', ['a', 'b'])] })).toBe(
      `export type UserFindUniqueWhere = (  /**\n` +
        `   * Composite unique index on fields: a, b\n` +
        `   *\n` +
        `   * @warning Optional field(s): b\n` +
        `   * Unlike single-field @unique, composite unique indexes treat null/NONE as concrete values\n` +
        `   * when at least one field has a non-null value.\n` +
        `   *\n` +
        `   * | Combination                       | Duplicate allowed? |\n` +
        `   * | ---------------------------------- | ------------------ |\n` +
        `   * | (null, null) + (null, null)        | YES                |\n` +
        `   * | (null, 'value') + (null, 'value')  | NO                 |\n` +
        `   * | ('value', null) + ('value', null)  | NO                 |\n` +
        `   * | ('value', 'value') + same          | NO                 |\n` +
        `   */\n` +
        `  { ab: { a: string; b: string | null } } & Omit<UserWhere, 'ab'>);`,
    );
  });

  test('the warning lists every optional field', () => {
    const m = [field({ name: 'a', isRequired: false }), field({ name: 'b', isRequired: false })];

    expect(where(m, { compositeDirectives: [composite('ab', ['a', 'b'])] })).toContain(
      '@warning Optional field(s): a, b',
    );
  });

  test('a composite over the id field adds no null suffix and no warning', () => {
    const optionalId = field({ name: 'id', type: 'record', isId: true, isRequired: false });
    const m = [optionalId, field({ name: 'a' })];
    const out = where(m, { compositeDirectives: [composite('ia', ['id', 'a'])] });

    expect(out).toContain('{ ia: { id: RecordIdInput<string>; a: string } }');
    expect(out).not.toContain('@warning');
  });

  test('a field name missing from the model is skipped', () => {
    expect(where([field({ name: 'a' })], { compositeDirectives: [composite('ab', ['a', 'ghost'])] })).toContain(
      '{ ab: { a: string } }',
    );
  });

  test('non-unique composite indexes are ignored', () => {
    expect(where([field({ name: 'a' })], { compositeDirectives: [composite('ix', ['a'], 'index')] })).toBe('');
  });

  test('composite variants follow id and single-field variants and join the Omit list', () => {
    const out = where([id, unique('email'), field({ name: 'a' })], {
      compositeDirectives: [composite('ea', ['email', 'a'])],
    });

    expect(out).toContain(`& Omit<UserWhere, 'id' | 'email' | 'ea'>)`);
    expect(out.indexOf('{ id:')).toBeLessThan(out.indexOf('{ email:'));
    expect(out.indexOf('{ email:')).toBeLessThan(out.indexOf('{ ea:'));
  });

  describe('dot-notation fields', () => {
    const registry: ObjectRegistry = {
      Address: object('Address', [
        field({ name: 'city' }),
        field({ name: 'zip', isRequired: false, type: 'int' }),
        objectField('geo', 'Geo'),
        field({ name: 'tags', type: 'string' }),
      ]),
      Geo: object('Geo', [field({ name: 'lat', type: 'float' })]),
    };
    const m = [objectField('address', 'Address'), field({ name: 'name' })];
    const cd = (...fields: string[]) => ({ compositeDirectives: [composite('k', fields)] });

    test('builds a nested object type mixed with a top-level field', () => {
      expect(where(m, cd('address.city', 'name'), registry)).toContain(
        '{ k: { address: { city: string }; name: string } }',
      );
    });

    test('merges two leaves under the same object', () => {
      expect(where(m, cd('address.city', 'address.zip'), registry)).toContain(
        '{ k: { address: { city: string; zip: number | null } } }',
      );
    });

    test('resolves a leaf two objects deep', () => {
      expect(where(m, cd('address.geo.lat'), registry)).toContain('{ k: { address: { geo: { lat: number } } } }');
    });

    test('an unknown leaf resolves to unknown', () => {
      expect(where(m, cd('address.nope'), registry)).toContain('{ k: { address: { nope: unknown } } }');
    });

    test('without a registry the leaf is unknown', () => {
      expect(where(m, cd('address.city'))).toContain('{ k: { address: { city: unknown } } }');
    });

    test('a path through a non-object field resolves to unknown', () => {
      expect(where(m, cd('address.tags.x'), registry)).toContain('{ k: { address: { tags: { x: unknown } } } }');
    });

    test('a path whose head is not an object field resolves to unknown', () => {
      expect(where(m, cd('name.x'), registry)).toContain('{ k: { name: { x: unknown } } }');
    });

    test('a path through an object missing from the registry resolves to unknown', () => {
      const ghost = [objectField('address', 'Ghost')];

      expect(where(ghost, cd('address.city'), registry)).toContain('{ k: { address: { city: unknown } } }');
    });

    test('an optional top-level object puts the dotted path in the warning', () => {
      const optional = [objectField('address', 'Address', { isRequired: false })];

      expect(where(optional, cd('address.city'), registry)).toContain('@warning Optional field(s): address.city');
    });
  });
});

describe('object @unique variants', () => {
  const m = [objectField('address', 'Address')];

  test('without a registry nothing is emitted', () => {
    expect(where(m)).toBe('');
  });

  test('a @unique sub-field becomes a nested variant', () => {
    const registry: ObjectRegistry = { Address: object('Address', [unique('zip')]) };

    expect(where(m, {}, registry)).toBe(
      `export type UserFindUniqueWhere = ({ address: { zip: string } } & Omit<UserWhere, 'address'>);`,
    );
  });

  test('an optional @unique sub-field gets a null suffix', () => {
    const registry: ObjectRegistry = {
      Address: object('Address', [field({ name: 'zip', isUnique: true, isRequired: false })]),
    };

    expect(where(m, {}, registry)).toContain('{ address: { zip: string | null } }');
  });

  test('a @unique sub-field of a nested object nests the path', () => {
    const registry: ObjectRegistry = {
      Address: object('Address', [objectField('inner', 'Inner')]),
      Inner: object('Inner', [unique('code')]),
    };

    expect(where(m, {}, registry)).toContain('{ address: { inner: { code: string } } }');
  });

  test('each @unique sub-field is its own variant, with the field omitted once', () => {
    const registry: ObjectRegistry = { Address: object('Address', [unique('zip'), unique('code')]) };

    expect(where(m, {}, registry)).toBe(
      `export type UserFindUniqueWhere = ({ address: { zip: string } } & Omit<UserWhere, 'address'>)\n` +
        `  | ({ address: { code: string } } & Omit<UserWhere, 'address'>);`,
    );
  });

  test('an object without @unique sub-fields emits nothing', () => {
    const registry: ObjectRegistry = { Address: object('Address', [field({ name: 'zip' })]) };

    expect(where(m, {}, registry)).toBe('');
  });

  test('array object fields are skipped', () => {
    const registry: ObjectRegistry = { Address: object('Address', [unique('zip')]) };

    expect(where([objectField('address', 'Address', { isArray: true })], {}, registry)).toBe('');
  });

  test('array object sub-fields are not descended into', () => {
    const registry: ObjectRegistry = {
      Address: object('Address', [objectField('inner', 'Inner', { isArray: true })]),
      Inner: object('Inner', [unique('code')]),
    };

    expect(where(m, {}, registry)).toBe('');
  });

  test('an object missing from the registry is skipped', () => {
    expect(where(m, {}, {})).toBe('');
  });

  test('a self-referencing object terminates', () => {
    const registry: ObjectRegistry = { Address: object('Address', [objectField('next', 'Address'), unique('zip')]) };

    expect(where(m, {}, registry)).toContain('{ address: { zip: string } }');
  });

  test('object variants come after id, unique and composite variants', () => {
    const registry: ObjectRegistry = { Address: object('Address', [unique('zip')]) };
    const out = where([id, ...m], {}, registry);

    expect(out).toBe(
      `export type UserFindUniqueWhere = ({ id: RecordIdInput<string> } & Omit<UserWhere, 'id' | 'address'>)\n` +
        `  | ({ address: { zip: string } } & Omit<UserWhere, 'id' | 'address'>);`,
    );
  });

  test('a field with type object but no objectInfo is skipped', () => {
    const registry: ObjectRegistry = { Address: object('Address', [unique('zip')]) };

    expect(where([field({ name: 'address', type: 'object' })], {}, registry)).toBe('');
  });
});
