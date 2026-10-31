/**
 * Type checks for the mixed `.cerial`/TypeScript fixture project, against the client generated from it.
 *
 * The client is `./generated`, written by `bun run generate:mixed-client` from `tests/fixtures/mixed` plus
 * `./extra`. `bun run typecheck` runs that step first, so a stale client cannot pass.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { CerialId, RecordIdInput } from 'cerial';
import type {
  Account,
  AccountCreate,
  Address,
  AddressInput,
  CFromTs,
  Meta,
  MetaInput,
  Purchase,
  PurchaseInput,
  Ticket,
  TicketInput,
  TFromC,
  TFromCInput,
} from './generated';

// A foreign key written in TypeScript takes the type of the `.cerial` target's `@id` (Record(int))
Test.checks([
  Test.check<Purchase['accountId'], CerialId<number>, Test.Pass>(),
  Test.check<PurchaseInput['accountId'], RecordIdInput<number>, Test.Pass>(),
]);

// ... and a foreign key written in `.cerial` takes the type of the TypeScript target's `@id`
Test.checks([
  Test.check<Ticket['purchaseId'], CerialId<number> | undefined, Test.Pass>(),
  Test.check<TicketInput['purchaseId'], RecordIdInput<number> | undefined, Test.Pass>(),
]);

// A `.cerial` field typed by a TypeScript object reads as that object
Test.checks([
  Test.check<Account['address'], Address, Test.Pass>(),
  Test.check<Address, { street: string; city: string }, Test.Pass>(),
  Test.check<AccountCreate['address'], AddressInput, Test.Pass>(),
]);

// The other way round, a TypeScript field typed by a `.cerial` object
Test.checks([
  Test.check<Purchase['meta'], Meta, Test.Pass>(),
  Test.check<Meta, { note: string; weight: number }, Test.Pass>(),
]);

// A TypeScript model inherits a `.cerial` abstract parent's fields, one typed by a TypeScript object
Test.checks([
  Test.check<TFromC['label'], string, Test.Pass>(),
  Test.check<TFromC['address'], Address, Test.Pass>(),
  Test.check<TFromCInput['address'], AddressInput, Test.Pass>(),
  Test.check<TFromC['note'], string, Test.Pass>(),
]);

// A `.cerial` model inherits a TypeScript abstract parent's fields, one typed by a `.cerial` object
Test.checks([
  Test.check<CFromTs['tag'], string, Test.Pass>(),
  Test.check<CFromTs['meta'], Meta, Test.Pass>(),
  Test.check<CFromTs['id'], CerialId<number>, Test.Pass>(),
]);

// @ts-expect-error a foreign key to an int @id is not a string
export const badForeignKey: PurchaseInput['accountId'] = 'account:1';

// @ts-expect-error the key is the TypeScript target's int @id, so a Ticket cannot point at a string key
export const badTicketKey: TicketInput = { id: 1, title: 't', purchaseId: 'purchase:abc' };

// @ts-expect-error the address object requires a city
export const missingCity: AddressInput = { street: 's' };

// @ts-expect-error weight is an Int, not a string
export const badMeta: MetaInput = { note: 'n', weight: 'heavy' };

// @ts-expect-error an inherited field keeps its type: label is a string
export const badInheritedLabel: TFromCInput = { id: 1, label: 5, address: { street: 's', city: 'c' }, note: 'n' };

// @ts-expect-error an inherited field is still required: address is missing
export const missingInherited: TFromCInput = { id: 1, label: 'l', note: 'n' };

// @ts-expect-error tag is inherited from the TypeScript parent, so it does not exist on TFromC
export type NotInherited = TFromC['tag'];
