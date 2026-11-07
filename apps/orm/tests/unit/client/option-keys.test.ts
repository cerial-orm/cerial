/**
 * An options key a model method does not take is refused by name before the connection is touched,
 * so a typo such as `wehre` cannot turn a filtered delete into an unfiltered one. Every key a method
 * does take is still accepted.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { Model } from '../../../src/client/model/model';
import { CerialValidationError } from '../../../src/errors';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

const touched: string[] = [];
const db = new Proxy(
  {},
  {
    get: (_t, prop) => {
      touched.push(String(prop));

      return undefined;
    },
  },
) as unknown as Surreal;
const model = new Model(db, registry.User!, registry);

const where = { name: 'a' };
const data = { name: 'a' };
const id = { id: 'x' };

type Call = (extra: Record<string, unknown>) => PromiseLike<unknown>;
const calls: [string, Call][] = [
  ['findOne', (e) => model.findOne({ where, ...e })],
  ['findUnique', (e) => model.findUnique({ where: id, ...e })],
  ['findMany', (e) => model.findMany({ where, ...e })],
  ['create', (e) => model.create({ data, ...e })],
  ['updateMany', (e) => model.updateMany({ where, data, ...e })],
  ['updateUnique', (e) => model.updateUnique({ where: id, data, ...e })],
  ['upsert', (e) => model.upsert({ where: id, create: data, update: data, ...e })],
  ['deleteMany', (e) => model.deleteMany({ where, ...e })],
  ['deleteUnique', (e) => model.deleteUnique({ where: id, ...e })],
];

const outcome = (run: () => PromiseLike<unknown>): Promise<unknown> =>
  (async () => run())().then(
    () => undefined,
    (error: unknown) => error,
  );

describe('unknown option keys', () => {
  test.each(calls)('%s refuses a misspelled key naming the key and the method', async (method, call) => {
    touched.length = 0;
    const error = await outcome(() => call({ wehre: { name: 'x' } }));

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as Error).message).toContain(`${method} does not take the option 'wehre'`);
    expect(touched).toEqual([]);
  });

  test('a deleteMany with its where misspelled names the key and deletes nothing', async () => {
    const error = await outcome(() => model.deleteMany({ wehre: where } as never));

    expect((error as Error).message).toContain("deleteMany does not take the option 'wehre'");
  });

  test.each([
    ['findMany', () => model.findMany({ where, whre: where } as never)],
    ['updateMany', () => model.updateMany({ data, where, whre: where } as never)],
    ['upsert', () => model.upsert({ where: id, create: data, retrun: true } as never)],
    ['findOne', () => model.findOne({ where, take: 1 } as never)],
  ])('%s refuses a key beside valid ones', async (_method, run) => {
    expect(await outcome(run)).toBeInstanceOf(CerialValidationError);
  });

  test('a key a method does not take is refused even when it is valid elsewhere', async () => {
    const error = await outcome(() => model.deleteMany({ where, select: { name: true } } as never));

    expect((error as Error).message).toContain("deleteMany does not take the option 'select'");
  });

  test('compute on a write keeps its own refusal', async () => {
    const error = await outcome(() => model.create({ data, compute: {} } as never));

    expect((error as Error).message).toContain('create does not accept compute');
  });

  test('limit on findOne keeps its own refusal', async () => {
    const error = await outcome(() => model.findOne({ where, limit: 1 } as never));

    expect((error as Error).message).toContain('findOne does not accept limit');
  });
});

describe('accepted option keys', () => {
  const accepted: [string, () => unknown][] = [
    ['findOne', () => model.findOne({ where, select: { name: true }, orderBy: { name: 'asc' }, include: {} })],
    ['findUnique', () => model.findUnique({ where: id, select: { name: true }, include: {} })],
    [
      'findMany',
      () => model.findMany({ where, select: { name: true }, orderBy: { name: 'asc' }, limit: 1, offset: 0 }),
    ],
    ['create', () => model.create({ data, select: { name: true }, include: {} })],
    ['updateMany', () => model.updateMany({ where, data, unset: {}, select: { name: true }, include: {} })],
    [
      'updateUnique',
      () => model.updateUnique({ where: id, data, unset: {}, select: { name: true }, include: {}, return: 'before' }),
    ],
    [
      'upsert',
      () =>
        model.upsert({
          where: id,
          create: data,
          update: data,
          unset: {},
          select: { name: true },
          include: {},
          return: true,
        }),
    ],
    ['deleteMany', () => model.deleteMany({ where })],
    ['deleteUnique', () => model.deleteUnique({ where: id, return: 'before' })],
  ];

  test.each(accepted)('%s takes every documented key without an unknown-option error', (_method, run) => {
    let message = '';
    try {
      run();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain('does not take the option');
  });

  test.each(calls)('%s accepts a txn key at the end of the call', async (_method, call) => {
    const error = await outcome(() => call({ txn: undefined }));

    expect((error as Error | undefined)?.message ?? '').not.toContain('does not take the option');
  });
});
