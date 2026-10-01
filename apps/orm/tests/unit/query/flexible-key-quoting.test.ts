/**
 * Unit Tests: @flexible sub-keys are backtick-quoted in compiled query text
 *
 * Declared fields keep their unquoted output; only undeclared keys on a
 * @flexible object are quoted, so a key can never terminate its own identifier.
 */

import { describe, expect, test } from 'bun:test';
import { compileFindMany, compileUpdateMany } from '../../../src/query/builder';
import { quoteSubKey } from '../../../src/utils/string-utils';
import { post, registry } from './select-validation-helpers';

const HOSTILE = "x'; REMOVE TABLE victim; --";
const QUOTED = "`x'; REMOVE TABLE victim; --`";

describe('quoteSubKey', () => {
  test('leaves plain identifiers untouched', () => {
    expect(quoteSubKey('city')).toBe('city');
    expect(quoteSubKey('_k2')).toBe('_k2');
  });

  test.each([
    ['my-key', '`my-key`'],
    ['ключ', '`ключ`'],
    ['2fa', '`2fa`'],
    ['', '``'],
    ['a`b', '`a\\`b`'],
    ['a\\', '`a\\\\`'],
    ['a\\`; REMOVE TABLE t; --', '`a\\\\\\`; REMOVE TABLE t; --`'],
    [HOSTILE, QUOTED],
  ])('quotes %j', (key, expected) => {
    expect(quoteSubKey(key)).toBe(expected);
  });
});

describe('flexible sub-key quoting in compiled queries', () => {
  test('where shorthand', () => {
    const q = compileFindMany(post, { where: { loose: { [HOSTILE]: 'y' } } } as never, registry);
    expect(q.query.text).toContain(`WHERE loose.${QUOTED} = $`);
    expect(q.query.text).not.toContain(`loose.${HOSTILE}`);
  });

  test('where operator object', () => {
    const q = compileFindMany(post, { where: { loose: { [HOSTILE]: { gt: 1 } } } } as never, registry);
    expect(q.query.text).toContain(`loose.${QUOTED} > $`);
  });

  test('where inside a closure (array object condition)', () => {
    const q = compileFindMany(post, { where: { loose: { OR: [{ [HOSTILE]: 'y' }] } } } as never, registry);
    expect(q.query.text).toContain(`loose.${QUOTED} = $`);
  });

  test('update data', () => {
    const q = compileUpdateMany(
      post,
      { where: { title: 'T' }, data: { loose: { [HOSTILE]: 'y' } } } as never,
      registry,
    );
    expect(q.query.text).toContain(`SET loose.${QUOTED} = $`);
    expect(q.query.text).not.toContain(`loose.${HOSTILE}`);
  });

  test('update data with null clears via quoted NONE', () => {
    const q = compileUpdateMany(
      post,
      { where: { title: 'T' }, data: { loose: { [HOSTILE]: null } } } as never,
      registry,
    );
    expect(q.query.text).toContain(`loose.${QUOTED} = NONE`);
  });

  test('select', () => {
    const q = compileFindMany(post, { select: { loose: { [HOSTILE]: true } } } as never, registry);
    expect(q.query.text).toContain(`loose.{ ${QUOTED} }`);
  });

  test('select nested key', () => {
    const q = compileFindMany(post, { select: { loose: { [HOSTILE]: { inner: true } } } } as never, registry);
    expect(q.query.text).toContain(`loose.{ ${QUOTED}.{ inner } }`);
  });

  test('orderBy', () => {
    const q = compileFindMany(post, { orderBy: { loose: { [HOSTILE]: 'asc' } } } as never, registry);
    expect(q.query.text).toContain(`ORDER BY loose.${QUOTED} ASC`);
  });

  test('declared sub-fields stay unquoted', () => {
    const q = compileFindMany(
      post,
      {
        where: { loose: { city: 'c' } },
        select: { loose: { city: true } },
        orderBy: { loose: { city: 'asc' } },
      } as never,
      registry,
    );
    expect(q.query.text).not.toContain('`');
  });

  test('bound variable names stay plain identifiers and are unique per key', () => {
    const q = compileFindMany(post, { where: { loose: { 'a-b': 1, 'a b': 2, 'a.b': 3 } } } as never, registry);
    const names = Object.keys(q.query.vars);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_]+$/);
  });
});
