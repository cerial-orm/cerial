/**
 * updateWhere and unset on an array of objects are typed but the builder has never applied them, so a
 * call that reports success changed nothing. Both are refused by field name on every update path;
 * replacing the array, { set } and { push } keep working.
 */

import { describe, expect, test } from 'bun:test';
import { compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../src/query/builder';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
object Role {
  name String
  level Int
}

model Account {
  id Record @id
  roles Role[]
}
`);
const account = registry.Account!;
const role = { name: 'admin', level: 1 };
const where = { id: 'a' };

const paths: [string, (data: Record<string, unknown>) => unknown][] = [
  ['updateMany', (data) => compileUpdateMany(account, { where, data } as never, registry)],
  ['updateUnique', (data) => compileUpdateUnique(account, { where, data } as never, registry)],
  ['upsert', (data) => compileUpsert(account, { where, create: { roles: [] }, update: data } as never, registry)],
];

const operations: [string, Record<string, unknown>][] = [
  ['updateWhere', { roles: { updateWhere: { where: { name: 'admin' }, data: { level: 2 } } } }],
  ['unset with a where', { roles: { unset: { where: { name: 'admin' } } } }],
  ['updateWhere beside a push', { roles: { push: role, updateWhere: { where: {}, data: { level: 2 } } } }],
];

const unsupported: [string, Record<string, unknown>, string][] = [
  ['pop', { roles: { pop: 1 } }, 'roles.pop'],
  ['remove', { roles: { remove: { name: 'admin' } } }, 'roles.remove'],
  ['delete', { roles: { delete: { where: { name: 'admin' } } } }, 'roles.delete'],
  ['delete beside a push', { roles: { push: role, delete: { where: { name: 'admin' } } } }, 'roles.delete'],
];

describe('operators an array of objects does not take', () => {
  for (const [path, run] of paths) {
    test.each(unsupported)(`${path} refuses %s naming the field and the supported forms`, (_label, data, field) => {
      expect(() => run(data)).toThrow(
        new RegExp(`${field} is not supported on an array of objects.*\\{ set \\}.*\\{ push \\}`),
      );
    });
  }
});

describe('unset on an array of objects', () => {
  const unsets: [string, Record<string, unknown>][] = [
    ['updateMany', { roles: { level: true } }],
    ['updateUnique', { roles: { level: true } }],
  ];

  test.each(unsets)('%s refuses the object form of unset naming the field', (name, unset) => {
    const run = () =>
      name === 'updateMany'
        ? compileUpdateMany(account, { where, data: {}, unset } as never, registry)
        : compileUpdateUnique(account, { where, data: {}, unset } as never, registry);

    expect(run).toThrow(/unset on 'roles' takes true only/);
  });

  test('upsert refuses the object form of unset', () => {
    expect(() =>
      compileUpsert(
        account,
        { where, create: { roles: [] }, update: {}, unset: { roles: { level: true } } } as never,
        registry,
      ),
    ).toThrow(/unset on 'roles' takes true only/);
  });
});

describe('updateWhere and unset on an object array', () => {
  for (const [path, run] of paths) {
    test.each(operations)(`${path} refuses %s naming the field`, (_label, data) => {
      expect(() => run(data)).toThrow(/roles\.(updateWhere|unset) is not supported on an array of objects/);
    });

    test(`${path} still takes the whole array, { set } and { push }`, () => {
      expect(() => run({ roles: [role] })).not.toThrow();
      expect(() => run({ roles: { set: [role] } })).not.toThrow();
      expect(() => run({ roles: { push: role } })).not.toThrow();
      expect(() => run({ roles: { push: [role, role] } })).not.toThrow();
    });
  }
});
