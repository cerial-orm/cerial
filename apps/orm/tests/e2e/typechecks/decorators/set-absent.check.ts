import { Test } from 'ts-toolbelt';
import type { SetBagWhere, SetBasicWhere, SetNestedWhere } from '../../generated';

type HasOp<T, K extends string, Op extends string> = K extends keyof T
  ? Exclude<NonNullable<T[K]>, readonly unknown[]> extends infer F
    ? Op extends keyof F
      ? 1
      : 0
    : 0
  : 0;

// SetBag is used through the optional SetNested.bag, so its array sub-fields can be absent
Test.checks([
  Test.check<HasOp<SetBagWhere, 'tags', 'isNone'>, 1, Test.Pass>(),
  Test.check<HasOp<SetBagWhere, 'nums', 'isNone'>, 1, Test.Pass>(),
  Test.check<HasOp<SetBagWhere, 'tags', 'isEmpty'>, 1, Test.Pass>(),
  // A model-level array is never absent, so it has isEmpty and no isNone
  Test.check<HasOp<SetBasicWhere, 'tags', 'isEmpty'>, 1, Test.Pass>(),
  Test.check<HasOp<SetBasicWhere, 'tags', 'isNone'>, 0, Test.Pass>(),
]);

const _ok: SetNestedWhere = { bag: { tags: { isNone: true } } };

// @ts-expect-error isNone is not an operator of a model-level array
const _bad: SetBasicWhere = { tags: { isNone: true } };
