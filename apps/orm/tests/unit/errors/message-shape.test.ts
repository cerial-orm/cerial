/**
 * Unit tests: the shape of each error class's message, one assertion per surface.
 *
 * These pin the structure a reader depends on (which input was rejected, which model and field, the
 * quoting) and not the wording around it, so the prose can improve without rewriting this file. A test
 * that names the class and the code is in `throw-sites-query.test.ts` and `throw-sites-runtime.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { Cerial } from '../../../src';
import { detectNestedConfigs } from '../../../src/cli/config/validator';
import { CerialTransaction } from '../../../src/client/cerial-transaction';
import { ConnectionManager } from '../../../src/client/connection';
import {
  compileCreate,
  compileFindMany,
  compileFindUnique,
  compileUpdateMany,
  compileUpsert,
} from '../../../src/query/builder';
import { validateUniqueField } from '../../../src/query/builders';
import { CerialDuration } from '../../../src/utils';
import { post, registry } from '../query/select-validation-helpers';
import { thrown } from './helpers';

const validPost = {
  title: 'T',
  authorId: 'author:1',
  address: { city: 'c', geo: { lat: 1, lng: 2 } },
  loose: { city: 'c', geo: { lat: 1, lng: 2 } },
  spot: ['l', { lat: 1, lng: 2 }],
};

const messageOf = (fn: () => unknown): string => (thrown(fn) as Error).message;

/** `Invalid <input>: Unknown field '<key>' on model <Model>`, the one shape every surface shares. */
const unknownFieldShape = (input: string, key: string): RegExp =>
  new RegExp(`^Invalid ${input}: Unknown field '${key}' on model Post\\b`);

describe('unknown-field messages share one shape on every surface', () => {
  test('where', () => {
    expect(messageOf(() => compileFindMany(post, { where: { nope: 1 } as never }, registry))).toMatch(
      unknownFieldShape('where clause', 'nope'),
    );
  });

  test('where, below an object field', () => {
    expect(messageOf(() => compileFindMany(post, { where: { address: { cty: 'x' } } as never }, registry))).toMatch(
      unknownFieldShape('where clause', 'address.cty'),
    );
  });

  test('select', () => {
    expect(messageOf(() => compileFindMany(post, { select: { titel: true } as never }, registry))).toMatch(
      unknownFieldShape('select', 'titel'),
    );
  });

  test('orderBy', () => {
    expect(messageOf(() => compileFindMany(post, { orderBy: { titel: 'asc' } as never }, registry))).toMatch(
      unknownFieldShape('orderBy', 'titel'),
    );
  });

  test('data', () => {
    expect(messageOf(() => compileCreate(post, { data: { ...validPost, typo: 1 } } as never, registry))).toMatch(
      unknownFieldShape('data', 'typo'),
    );
  });

  test('unset', () => {
    const run = () =>
      compileUpdateMany(
        post,
        { where: { title: 'T' }, data: { title: 'U' }, unset: { typo: true } } as never,
        registry,
      );

    expect(messageOf(run)).toMatch(unknownFieldShape('unset', 'typo'));
  });

  test('include', () => {
    expect(messageOf(() => compileFindMany(post, { include: { psots: true } as never }, registry))).toMatch(
      unknownFieldShape('include', 'psots'),
    );
  });

  test('upsert names neither half, whichever one was rejected', () => {
    const create = messageOf(() =>
      compileUpsert(
        post,
        { where: { id: 'post:1' }, create: { ...validPost, typo: 1 }, update: {} } as never,
        registry,
      ),
    );
    const update = messageOf(() =>
      compileUpsert(post, { where: { id: 'post:1' }, create: validPost, update: { typo: 1 } } as never, registry),
    );

    expect(create).toMatch(unknownFieldShape('data', 'typo'));
    expect(update).toBe(create);
  });
});

describe('validation messages name the rejected input and the field', () => {
  test('a missing required field', () => {
    const { title: _title, ...rest } = validPost;

    expect(messageOf(() => compileCreate(post, { data: rest } as never, registry))).toMatch(
      /^Invalid data: .*\btitle\b/,
    );
  });

  test('a bad limit names the option', () => {
    expect(messageOf(() => compileFindMany(post, { limit: -1 }, registry))).toMatch(
      /^Invalid limit\/offset: .*\blimit\b/,
    );
  });

  test('a unique lookup with no unique field names the call and lists the alternatives', () => {
    expect(messageOf(() => validateUniqueField({ title: 'T' }, post, 'findUnique'))).toMatch(
      /^At least one unique field must be provided in where clause for findUnique\. Available unique fields: .*\bid\b/,
    );
  });

  test('a unique key given a filter object names the call, the model and the key', () => {
    expect(messageOf(() => validateUniqueField({ id: { in: ['a'] } } as never, post, 'deleteUnique'))).toMatch(
      /^deleteUnique on Post: unique key 'id' must be a plain value/,
    );
  });

  test('a nested relation rule names the field and the model', () => {
    const run = () =>
      compileCreate(
        post,
        { data: { ...validPost, author: { create: { name: 'A' }, connect: 'author:1' } } } as never,
        registry,
      );

    expect(messageOf(run)).toMatch(/^Field "author" on model "Post": /);
  });

  test('a value wrapper names the wrapper', () => {
    expect(messageOf(() => new CerialDuration(1 as never))).toMatch(/^Invalid input type for CerialDuration: number$/);
  });

  test('a unique lookup keeps the unknown-field shape', () => {
    expect(messageOf(() => compileFindUnique(post, { where: { nope: 1 } as never }, registry))).toMatch(
      unknownFieldShape('where clause', 'nope'),
    );
  });
});

describe('connection, transaction and build-time messages', () => {
  test('an unknown connection is quoted by name', () => {
    expect(messageOf(() => new ConnectionManager({}).useConnection('nope'))).toBe('Connection "nope" not found');
    expect(messageOf(() => Cerial.getInstance('nope'))).toBe('Connection nope not found');
  });

  test('an unknown model is quoted by name', () => {
    const tx = new CerialTransaction({} as never, {});

    expect(messageOf(() => tx._getModel('Uesr'))).toBe('Unknown model "Uesr". No models are registered.');
  });

  test('an ended transaction says so', async () => {
    const tx = new CerialTransaction({ commit: async () => {} } as never, {});

    await tx.commit();
    expect(messageOf(() => tx._ensureActive())).toMatch(/^Transaction already ended/);
  });

  test('nested configs name the parent and the child path', () => {
    expect(messageOf(() => detectNestedConfigs(['a', 'a/b']))).toMatch(/^Nested configs detected: "a" contains "a\/b"/);
  });
});
