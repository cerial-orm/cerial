/**
 * The runtime key table must match the option types of the Model methods in both directions: a key added
 * to a method's options type and missing from the table would be refused at runtime, and a table key the
 * type lacks would be silently accepted. Either makes `tsc` fail here. The extra entries the table keeps on
 * purpose (so an older, more specific refusal still fires) are listed per method below.
 */

import { expect, test } from 'bun:test';
import type { Model } from '../../../src/client/model/model';
import type { METHOD_KEYS } from '../../../src/client/model/option-keys';
import { type OptionedMethod } from '../../../src/client/model/option-keys';

type M = Model;
type Keys<F extends (...args: never[]) => unknown> = Exclude<keyof NonNullable<Parameters<F>[0]>, 'txn'>;
type TableKeys<K extends OptionedMethod> = (typeof METHOD_KEYS)[K][number];

/** Keys the table lists that the method's type omits, each refused by its own named check */
interface Compat {
  findOne: 'limit' | 'offset';
  findUnique: 'orderBy' | 'limit' | 'offset';
  findMany: never;
  create: 'compute';
  updateMany: 'compute';
  updateUnique: 'compute';
  upsert: 'compute';
  deleteMany: 'compute';
  deleteUnique: 'compute';
}

interface Typed {
  findOne: Keys<M['findOne']>;
  findUnique: Keys<M['findUnique']>;
  findMany: Keys<M['findMany']>;
  create: Keys<M['create']>;
  updateMany: Keys<M['updateMany']>;
  updateUnique: Keys<M['updateUnique']>;
  upsert: Keys<M['upsert']>;
  deleteMany: Keys<M['deleteMany']>;
  deleteUnique: Keys<M['deleteUnique']>;
}

type Expected<K extends OptionedMethod> = Typed[K] | Compat[K];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AllSame = { [K in OptionedMethod]: Same<TableKeys<K>, Expected<K>> };
// Fails to compile when any method's table and options type differ
const agree: { [K in OptionedMethod]: true } = {} as AllSame;

test('the key table agrees with the method option types', () => {
  expect(Object.keys(agree)).toEqual([]);
});
