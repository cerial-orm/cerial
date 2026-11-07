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
