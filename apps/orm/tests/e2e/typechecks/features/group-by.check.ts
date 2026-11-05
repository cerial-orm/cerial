/**
 * Type checks for `groupBy`: the row type follows the call's literal arguments.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Every positive shape is compared with `Test.check`, which fails on a wider or a narrower type; every
 * refusal is a `@ts-expect-error` that fails when the call starts to compile.
 */

import type { CerialDecimal, CerialDuration, CerialId, CerialUuid } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { GbOrder } from '../../generated';
import type { CerialClient } from '../../generated/client';

const { checks, check } = Test;

declare const client: CerialClient;
const orders = client.db.GbOrder;

/** One row of an awaited groupBy result. */
type RowOf<Rows extends unknown[]> = Rows[number];

async function keysAndCounts() {
  // NONE keys leave the row, so an optional key is optional on the row; a null key adds null
  const rows = await orders.groupBy({
    by: { label: true, region: true, nick: true, status: true, tier: true },
    _count: true,
  });
  checks([
    check<
      RowOf<typeof rows>,
      {
        label: string;
        region?: string;
        nick?: string | null;
        status: 'OPEN' | 'SHIPPED' | 'CANCELLED';
        tier: 'free' | 'pro' | 'team';
        _count: { _all: number };
      },
      Test.Pass
    >(),
  ]);

  // by alone is a valid call: no aggregate namespaces on the row
  const bare = await orders.groupBy({ by: { label: true } });
  checks([check<RowOf<typeof bare>, { label: string }, Test.Pass>()]);

  // _count: true and { _all: true } give the same row
  const spelled = await orders.groupBy({ by: { label: true }, _count: { _all: true, bonus: true } });
  checks([check<RowOf<typeof spelled>, { label: string; _count: { _all: number; bonus: number } }, Test.Pass>()]);
}

async function keyTypes() {
  const rows = await orders.groupBy({
    by: {
      id: true,
      qty: true,
      price: true,
      placed: true,
      ttl: true,
      ref: true,
      paid: true,
      codes: true,
      authorId: true,
      tagIds: true,
    },
  });
  checks([
    check<
      RowOf<typeof rows>,
      {
        id: GbOrder['id'];
        qty: number;
        price: CerialDecimal;
        placed: Date;
        ttl: CerialDuration;
        ref: CerialUuid;
        paid: boolean;
        codes: string[];
        authorId?: CerialId<string>;
        tagIds: CerialId<string>[];
      },
      Test.Pass
    >(),
  ]);
}

async function objectKeys() {
  const rows = await orders.groupBy({ by: { address: { city: true, zip: true }, altAddress: { city: true } } });
  checks([
    check<RowOf<typeof rows>, { address: { city: string; zip?: string }; altAddress?: { city: string } }, Test.Pass>(),
  ]);
}

async function aggregates() {
  const rows = await orders.groupBy({
    by: { label: true },
    _sum: { qty: true, price: true, bonus: true, units: true },
    _avg: { weight: true, price: true },
    _min: { placed: true, ttl: true, bonus: true, label: true },
    _max: { paid: true, status: true },
    _group: { codes: true, nick: true, bonus: true, tier: true },
  });
  checks([
    check<
      RowOf<typeof rows>,
      {
        label: string;
        _sum: { qty: number; price: CerialDecimal; bonus: CerialDecimal; units: number };
        _avg: { weight: number | null; price: CerialDecimal | null };
        _min: { placed: Date | null; ttl: CerialDuration | null; bonus: CerialDecimal | null; label: string | null };
        _max: { paid: boolean | null; status: 'OPEN' | 'SHIPPED' | 'CANCELLED' | null };
        _group: {
          codes: string[];
          nick: (string | null)[];
          bonus: CerialDecimal[];
          tier: ('free' | 'pro' | 'team')[];
        };
      },
      Test.Pass
    >(),
  ]);
}

async function onlyRequestedAggregatesAppear() {
  const rows = await orders.groupBy({ by: { label: true }, _sum: { qty: true } });
  const row = rows[0]!;
  const qty: number = row._sum.qty;
  void qty;
  // @ts-expect-error price is not requested in _sum
  void row._sum.price;
  // @ts-expect-error _avg is not requested
  void row._avg;
  // @ts-expect-error qty is not a key of this call
  void row.qty;
}

async function transactionResults() {
  const [groups, total] = await client.$transaction([
    orders.groupBy({ by: { status: true }, _count: true }),
    orders.count(),
  ]);
  checks([
    check<RowOf<typeof groups>, { status: 'OPEN' | 'SHIPPED' | 'CANCELLED'; _count: { _all: number } }, Test.Pass>(),
    check<typeof total, number, Test.Pass>(),
  ]);

  const viaCallback = await client.$transaction(async (tx) =>
    tx.GbOrder.groupBy({ by: { paid: true }, _sum: { qty: true } }),
  );
  checks([check<RowOf<typeof viaCallback>, { paid: boolean; _sum: { qty: number } }, Test.Pass>()]);
}

async function orderingFollowsTheCall() {
  await orders.groupBy({
    by: { label: true, address: { city: true } },
    _count: true,
    _sum: { price: true },
    orderBy: { label: 'asc', _count: { _all: 'desc' }, _sum: { price: 'asc' }, address: { city: 'desc' } },
    limit: 3,
    offset: 1,
  });
}

async function refusals() {
  // @ts-expect-error _sum takes numeric fields, not a string
  await orders.groupBy({ by: { label: true }, _sum: { label: true } });
  // @ts-expect-error _avg takes numeric fields, not a bool
  await orders.groupBy({ by: { label: true }, _avg: { paid: true } });
  // @ts-expect-error nope is not a field
  await orders.groupBy({ by: { nope: true } });
  // @ts-expect-error an object key names its sub-keys
  await orders.groupBy({ by: { address: true } });
  // @ts-expect-error nope is not a sub-key of address
  await orders.groupBy({ by: { address: { nope: true } } });
  // @ts-expect-error a relation is not a key
  await orders.groupBy({ by: { author: true } });
  // @ts-expect-error having is not a groupBy option
  await orders.groupBy({ by: { label: true }, having: {} });
  // @ts-expect-error select is not a groupBy option
  await orders.groupBy({ by: { label: true }, select: { label: true } });
  // @ts-expect-error a key is true, never false
  await orders.groupBy({ by: { label: false } });
  // @ts-expect-error _avg is not requested, so it does not order
  await orders.groupBy({ by: { label: true }, _sum: { qty: true }, orderBy: { _avg: { qty: 'asc' } } });
  // @ts-expect-error price is not requested in _sum
  await orders.groupBy({ by: { label: true }, _sum: { qty: true }, orderBy: { _sum: { price: 'asc' } } });
  // @ts-expect-error qty is not a group key
  await orders.groupBy({ by: { label: true }, orderBy: { qty: 'asc' } });
  // @ts-expect-error _group collects arrays and does not order
  await orders.groupBy({ by: { label: true }, _group: { qty: true }, orderBy: { _group: { qty: 'asc' } } });
  // @ts-expect-error the direction is asc or desc
  await orders.groupBy({ by: { label: true }, orderBy: { label: 'up' } });
  // @ts-expect-error where takes the model's fields
  await orders.groupBy({ by: { label: true }, where: { nope: 1 } });
  // @ts-expect-error limit is a number
  await orders.groupBy({ by: { label: true }, limit: '3' });
}

async function otherModels() {
  // a model with no numeric field offers no _sum or _avg
  const labels = await client.db.GbLabel.groupBy({ by: { name: true }, _min: { note: true }, _count: { note: true } });
  checks([
    check<RowOf<typeof labels>, { name: string; _min: { note: string | null }; _count: { note: number } }, Test.Pass>(),
  ]);
  // @ts-expect-error GbLabel has no numeric field, so it has no _sum
  await client.db.GbLabel.groupBy({ by: { name: true }, _sum: { name: true } });

  // a model whose only groupable field is its id
  const bare = await client.db.GbBare.groupBy({ by: { id: true }, _count: true });
  checks([check<RowOf<typeof bare>, { id: GbOrder['id']; _count: { _all: number } }, Test.Pass>()]);
  // @ts-expect-error GbBare has no label
  await client.db.GbBare.groupBy({ by: { label: true } });
}

void [
  keysAndCounts,
  keyTypes,
  objectKeys,
  aggregates,
  onlyRequestedAggregatesAppear,
  transactionResults,
  orderingFollowsTheCall,
  refusals,
  otherModels,
];
