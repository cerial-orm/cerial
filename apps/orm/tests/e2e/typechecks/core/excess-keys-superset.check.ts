/**
 * Type checks that pin the gate of `SelectArg`, `DataArg` and `IncludeArg` against the refusal each one guards.
 *
 * Each argument helper runs its cheap key-set check (`*ExcessKeys`) first and only intersects the expensive refusal
 * (`*Refusal`) when that check finds a key. A gate that misses a position the refusal reaches would let a typo through
 * unrefused, with nothing else failing. So each recursion branch of each refusal gets a typo here, and its gate must be
 * non-never; a valid argument at the same position must leave the gate never.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  DataExcessKeys,
  FlexUserUpdateInput,
  IncludeExcessKeys,
  ObjectTestOrderUpdateInput,
  PostInclude,
  RelObjCompanyUpdateInput,
  SelectExcessKeys,
  UnsetTestUpdateInput,
  UserInclude,
  UserUpdateInput,
} from '../../generated';
import type { FlexUserSelectFields } from '../../generated/models/flexuser';
import type { UnsetTestSelectFields } from '../../generated/models/unsettest';

type Gate<Keys> = [Keys] extends [never] ? 'open' : 'caught';

// =============================================================================
// SelectRefusal branches
// =============================================================================

type SelOwnKey = SelectExcessKeys<{ id: true; nope: true }, UnsetTestSelectFields>;
type SelObjectSub = SelectExcessKeys<{ address: { city: true; nope: true } }, UnsetTestSelectFields>;
type SelObjectDeep = SelectExcessKeys<{ nested: { mid: { deep: { code: true; nope: true } } } }, UnsetTestSelectFields>;
type SelTupleElement = SelectExcessKeys<{ tagged: { 1: { payload: true; nope: true } } }, UnsetTestSelectFields>;
type SelRecursiveSixth = SelectExcessKeys<
  { tree: { child: { child: { child: { child: { nope: true } } } } } },
  UnsetTestSelectFields
>;
type SelRecursiveSeventh = SelectExcessKeys<
  { tree: { child: { child: { child: { child: { child: { nope: true } } } } } } },
  UnsetTestSelectFields
>;
type SelStrictOfFlexible = SelectExcessKeys<{ strictAddress: { city: true; extra: true } }, FlexUserSelectFields>;
type SelFlexible = SelectExcessKeys<{ address: { city: true; extra: true } }, FlexUserSelectFields>;
type SelValid = SelectExcessKeys<
  { id: true; address: { city: true }; nested: { mid: { deep: { code: true } } }; tagged: { 1: { payload: true } } },
  UnsetTestSelectFields
>;

// =============================================================================
// IncludeRefusal branches
// =============================================================================

type IncOwnKey = IncludeExcessKeys<{ posts: true; nope: true }, UserInclude>;
type IncEntryOption = IncludeExcessKeys<{ posts: { limit: 1; nope: true } }, UserInclude>;
type IncEntrySelect = IncludeExcessKeys<{ posts: { select: { title: true; nope: true } } }, UserInclude>;
type IncNestedInclude = IncludeExcessKeys<{ posts: { include: { author: true; nope: true } } }, UserInclude>;
type IncNestedEntryOption = IncludeExcessKeys<{ posts: { include: { author: { nope: true } } } }, UserInclude>;
type IncNestedSelect = IncludeExcessKeys<
  { posts: { include: { author: { select: { name: true; nope: true } } } } },
  UserInclude
>;
type IncValid = IncludeExcessKeys<
  { posts: { select: { title: true }; include: { author: { select: { name: true } } }; limit: 1 }; profile: true },
  UserInclude
>;
type IncPostValid = IncludeExcessKeys<{ author: { include: { posts: true } } }, PostInclude>;

// =============================================================================
// DataRefusal branches
// =============================================================================

type DataOwnKey = DataExcessKeys<{ name: string; nope: number }, UnsetTestUpdateInput>;
type DataObjectField = DataExcessKeys<{ shipping: { street: string; nope: number } }, UnsetTestUpdateInput>;
type DataObjectDeep = DataExcessKeys<
  { nested: { mid: { label: string; deep: { code: string; nope: number } } } },
  UnsetTestUpdateInput
>;
type DataObjectSet = DataExcessKeys<{ address: { set: { street: string; nope: number } } }, UnsetTestUpdateInput>;
type DataTupleArray = DataExcessKeys<{ tagged: [string, { payload: string; nope: number }] }, UnsetTestUpdateInput>;
type DataTupleObject = DataExcessKeys<
  { tagged: { tag: string; 1: { set: { payload: string; nope: number } } } },
  UnsetTestUpdateInput
>;
type DataTupleElementUpdate = DataExcessKeys<
  { tagged: { 1: { payload: string; nope: number } } },
  UnsetTestUpdateInput
>;
type DataTupleKey = DataExcessKeys<{ tagged: { tag: string; nope: number } }, UnsetTestUpdateInput>;
type DataPushOne = DataExcessKeys<
  { items: { push: { productName: string; quantity: number; price: number; tags: never[]; nope: number } } },
  ObjectTestOrderUpdateInput
>;
type DataPushMany = DataExcessKeys<
  { items: { push: { productName: string; nope: number }[] } },
  ObjectTestOrderUpdateInput
>;
type DataSetMany = DataExcessKeys<
  { items: { set: { productName: string; nope: number }[] } },
  ObjectTestOrderUpdateInput
>;
type DataArrayOp = DataExcessKeys<
  { items: { push: { productName: string }; nope: number } },
  ObjectTestOrderUpdateInput
>;
type DataConnectKey = DataExcessKeys<{ posts: { connect: string; nope: number } }, UserUpdateInput>;
type DataCreateBlock = DataExcessKeys<{ posts: { create: { title: string; nope: number } } }, UserUpdateInput>;
type DataCreateList = DataExcessKeys<{ posts: { create: { title: string; nope: number }[] } }, UserUpdateInput>;
type DataCreateRelation = DataExcessKeys<
  { employees: { create: { name: string; nope: number }[] } },
  RelObjCompanyUpdateInput
>;
type DataRecursiveSixth = DataExcessKeys<
  {
    tree: {
      payload: string;
      child: { payload: string; child: { payload: string; child: { payload: string; child: { nope: number } } } };
    };
  },
  UnsetTestUpdateInput
>;
type DataRecursiveSeventh = DataExcessKeys<
  {
    tree: {
      payload: string;
      child: {
        payload: string;
        child: { payload: string; child: { payload: string; child: { payload: string; child: { nope: number } } } };
      };
    };
  },
  UnsetTestUpdateInput
>;
type DataStrictOfFlexible = DataExcessKeys<{ strictAddress: { city: string; extra: string } }, FlexUserUpdateInput>;
type DataFlexible = DataExcessKeys<{ address: { city: string; extra: string } }, FlexUserUpdateInput>;
type DataValid = DataExcessKeys<
  {
    name: string;
    nested: { mid: { label: string; deep: { code: string } } };
    tagged: [string, { payload: string }];
    address: { set: { street: string; city: string } };
  },
  UnsetTestUpdateInput
>;
type DataValidItems = DataExcessKeys<
  { items: { push: { productName: string; quantity: number; price: number; tags: never[] }[] } },
  ObjectTestOrderUpdateInput
>;

Test.checks([
  // select
  Test.check<Gate<SelOwnKey>, 'caught', Test.Pass>(),
  Test.check<Gate<SelObjectSub>, 'caught', Test.Pass>(),
  Test.check<Gate<SelObjectDeep>, 'caught', Test.Pass>(),
  Test.check<Gate<SelTupleElement>, 'caught', Test.Pass>(),
  Test.check<Gate<SelRecursiveSixth>, 'caught', Test.Pass>(),
  Test.check<Gate<SelStrictOfFlexible>, 'caught', Test.Pass>(),
  Test.check<Gate<SelFlexible>, 'open', Test.Pass>(),
  Test.check<Gate<SelRecursiveSeventh>, 'open', Test.Pass>(),
  Test.check<Gate<SelValid>, 'open', Test.Pass>(),
  // include
  Test.check<Gate<IncOwnKey>, 'caught', Test.Pass>(),
  Test.check<Gate<IncEntryOption>, 'caught', Test.Pass>(),
  Test.check<Gate<IncEntrySelect>, 'caught', Test.Pass>(),
  Test.check<Gate<IncNestedInclude>, 'caught', Test.Pass>(),
  Test.check<Gate<IncNestedEntryOption>, 'caught', Test.Pass>(),
  Test.check<Gate<IncNestedSelect>, 'caught', Test.Pass>(),
  Test.check<Gate<IncValid>, 'open', Test.Pass>(),
  Test.check<Gate<IncPostValid>, 'open', Test.Pass>(),
  // data
  Test.check<Gate<DataOwnKey>, 'caught', Test.Pass>(),
  Test.check<Gate<DataObjectField>, 'caught', Test.Pass>(),
  Test.check<Gate<DataObjectDeep>, 'caught', Test.Pass>(),
  Test.check<Gate<DataObjectSet>, 'caught', Test.Pass>(),
  Test.check<Gate<DataTupleArray>, 'caught', Test.Pass>(),
  Test.check<Gate<DataTupleObject>, 'caught', Test.Pass>(),
  Test.check<Gate<DataTupleElementUpdate>, 'caught', Test.Pass>(),
  Test.check<Gate<DataTupleKey>, 'caught', Test.Pass>(),
  Test.check<Gate<DataPushOne>, 'caught', Test.Pass>(),
  Test.check<Gate<DataPushMany>, 'caught', Test.Pass>(),
  Test.check<Gate<DataSetMany>, 'caught', Test.Pass>(),
  Test.check<Gate<DataArrayOp>, 'caught', Test.Pass>(),
  Test.check<Gate<DataConnectKey>, 'caught', Test.Pass>(),
  Test.check<Gate<DataCreateBlock>, 'caught', Test.Pass>(),
  Test.check<Gate<DataCreateList>, 'caught', Test.Pass>(),
  Test.check<Gate<DataCreateRelation>, 'caught', Test.Pass>(),
  Test.check<Gate<DataRecursiveSixth>, 'caught', Test.Pass>(),
  Test.check<Gate<DataStrictOfFlexible>, 'caught', Test.Pass>(),
  Test.check<Gate<DataFlexible>, 'open', Test.Pass>(),
  Test.check<Gate<DataRecursiveSeventh>, 'open', Test.Pass>(),
  Test.check<Gate<DataValid>, 'open', Test.Pass>(),
  Test.check<Gate<DataValidItems>, 'open', Test.Pass>(),
]);
