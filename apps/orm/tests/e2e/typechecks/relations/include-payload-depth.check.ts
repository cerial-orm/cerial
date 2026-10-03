/**
 * Exact-equality checks for the recursive include payload past depth 1,
 * including `select` nested inside `include`.
 *
 * `select` inside `include` narrows the published type only. At runtime the
 * related rows come back whole, so these checks describe the type a caller
 * sees, not the row the database returns.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { Empty, Flat } from '../helpers';
import type {
  GetCategoryTreeIncludePayload,
  GetCategoryTreePayload,
  GetOdChildPayload,
  GetOdGrandparentPayload,
  GetRelObjCompanyIncludePayload,
} from '../../generated';

const { checks, check } = Test;

type Tree = { id: CerialId<string>; name: string; parentId?: CerialId<string> | null };

// =============================================================================
// Depth 1 baseline
// =============================================================================

checks([
  check<Flat<GetCategoryTreeIncludePayload<{ parent: true }>>, Flat<{ parent: Tree }>, Test.Pass>(),
  check<Flat<GetCategoryTreeIncludePayload<{ children: true }>>, Flat<{ children: Tree[] }>, Test.Pass>(),
  // A relation switched off contributes nothing
  check<Flat<GetCategoryTreeIncludePayload<{ parent: false }>>, Empty, Test.Pass>(),
]);

// =============================================================================
// Depth 2
// =============================================================================

checks([
  // include inside include
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { parent: true } } }>>,
    Flat<{ parent: Tree & { parent: Tree } }>,
    Test.Pass
  >(),
  // to-many inside to-many keeps the array at both levels
  check<
    Flat<GetCategoryTreeIncludePayload<{ children: { include: { children: true } } }>>,
    Flat<{ children: (Tree & { children: Tree[] })[] }>,
    Test.Pass
  >(),
  // forward then reverse
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { children: true } } }>>,
    Flat<{ parent: Tree & { children: Tree[] } }>,
    Test.Pass
  >(),
  // sibling relations at the second level
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { parent: true; children: true } } }>>,
    Flat<{ parent: Tree & { parent: Tree; children: Tree[] } }>,
    Test.Pass
  >(),
  // where, limit and orderBy shape the query, never the payload
  check<
    Flat<
      GetCategoryTreeIncludePayload<{ children: { limit: 2; orderBy: { name: 'asc' }; include: { parent: true } } }>
    >,
    Flat<{ children: (Tree & { parent: Tree })[] }>,
    Test.Pass
  >(),
]);

// =============================================================================
// Depth 3
// =============================================================================

checks([
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { parent: { include: { parent: true } } } } }>>,
    Flat<{ parent: Tree & { parent: Tree & { parent: Tree } } }>,
    Test.Pass
  >(),
  check<
    Flat<GetCategoryTreeIncludePayload<{ children: { include: { children: { include: { children: true } } } } }>>,
    Flat<{ children: (Tree & { children: (Tree & { children: Tree[] })[] })[] }>,
    Test.Pass
  >(),
  // direction can change at each level
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { children: { include: { parent: true } } } } }>>,
    Flat<{ parent: Tree & { children: (Tree & { parent: Tree })[] } }>,
    Test.Pass
  >(),
]);

// =============================================================================
// select nested inside include
// =============================================================================

checks([
  // select at depth 1 narrows the related model
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { select: { name: true } } }>>,
    Flat<{ parent: { name: string } }>,
    Test.Pass
  >(),
  // a false entry is dropped from the narrowed model
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { select: { name: true; id: false } } }>>,
    Flat<{ parent: { name: string } }>,
    Test.Pass
  >(),
  // select and include together at depth 1: narrowed model plus its relations
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { select: { name: true }; include: { parent: true } } }>>,
    Flat<{ parent: { name: string } & { parent: Tree } }>,
    Test.Pass
  >(),
  // select at depth 2
  check<
    Flat<GetCategoryTreeIncludePayload<{ parent: { include: { parent: { select: { id: true } } } } }>>,
    Flat<{ parent: Tree & { parent: { id: CerialId<string> } } }>,
    Test.Pass
  >(),
  // select at every level of a depth-2 chain
  check<
    Flat<
      GetCategoryTreeIncludePayload<{
        parent: { select: { name: true }; include: { parent: { select: { id: true } } } };
      }>
    >,
    Flat<{ parent: { name: string } & { parent: { id: CerialId<string> } } }>,
    Test.Pass
  >(),
  // select at depth 3
  check<
    Flat<
      GetCategoryTreeIncludePayload<{
        parent: { include: { parent: { include: { parent: { select: { name: true } } } } } };
      }>
    >,
    Flat<{ parent: Tree & { parent: Tree & { parent: { name: string } } } }>,
    Test.Pass
  >(),
  // select at depth 3 on a to-many leaf keeps the array
  check<
    Flat<
      GetCategoryTreeIncludePayload<{
        parent: { include: { parent: { include: { children: { select: { name: true } } } } } };
      }>
    >,
    Flat<{ parent: Tree & { parent: Tree & { children: { name: string }[] } } }>,
    Test.Pass
  >(),
]);

// =============================================================================
// Through the model payload: own select plus nested include
// =============================================================================

checks([
  check<
    Flat<GetCategoryTreePayload<{ name: true }, { parent: { include: { parent: true } } }>>,
    Flat<{ name: string } & { parent: Tree & { parent: Tree } }>,
    Test.Pass
  >(),
  check<
    Flat<GetCategoryTreePayload<undefined, { parent: { select: { name: true }; include: { parent: true } } }>>,
    Flat<Tree & { parent: { name: string } & { parent: Tree } }>,
    Test.Pass
  >(),
]);

// =============================================================================
// Across models: OdChild -> OdParent -> OdGrandparent, and back down
// =============================================================================

type Od = { id: CerialId<string>; name: string };
type OdWithKey = Od & { parentId?: CerialId<string> | null };
type OdParentRow = Od & { grandparentId?: CerialId<string> | null };

checks([
  check<
    Flat<GetOdChildPayload<undefined, { parent: { include: { grandparent: true } } }>>,
    Flat<OdWithKey & { parent: OdParentRow & { grandparent: Od } }>,
    Test.Pass
  >(),
  check<
    Flat<GetOdChildPayload<undefined, { parent: { include: { grandparent: { select: { name: true } } } } }>>,
    Flat<OdWithKey & { parent: OdParentRow & { grandparent: { name: string } } }>,
    Test.Pass
  >(),
  check<
    Flat<GetOdGrandparentPayload<undefined, { parents: { include: { children: true } } }>>,
    Flat<Od & { parents: (OdParentRow & { children: OdWithKey[] })[] }>,
    Test.Pass
  >(),
  check<
    Flat<GetOdGrandparentPayload<undefined, { parents: { include: { children: { select: { name: true } } } } }>>,
    Flat<Od & { parents: (OdParentRow & { children: { name: string }[] })[] }>,
    Test.Pass
  >(),
]);

// =============================================================================
// An object sub-select inside an include narrows the object's own keys
// =============================================================================

checks([
  check<
    Flat<GetRelObjCompanyIncludePayload<{ employees: { select: { homeAddress: { city: true } } } }>>,
    Flat<{ employees: { homeAddress: { city: string } }[] }>,
    Test.Pass
  >(),
]);

// =============================================================================
// Negative: a relation that is not included is not on the payload
// =============================================================================

type ParentOnly = GetCategoryTreeIncludePayload<{ parent: { include: { parent: true } } }>;

// @ts-expect-error - children was not included
export const notIncluded: ParentOnly['children'] = [];
