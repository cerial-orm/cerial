---
title: Generated Types
parent: Type System
nav_order: 3
---

# Generated Types

Cerial generates a comprehensive set of TypeScript types for every model and object in your schema. These types power autocompletion, compile-time validation, and runtime type safety across all query operations.

## Types Generated Per Model

For each model in your schema, Cerial generates the following types:

| Type                       | Description                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                     | Base output interface. All fields use output types (`CerialId<T>` for records, `Date` for datetimes).                                                                                                             |
| `UserInput`                | Base input interface. Record fields use `RecordIdInput<T>` instead of `CerialId<T>`.                                                                                                                              |
| `UserCreate`               | Data type for `create()`. Derives from `UserInput` with relation fields replaced by nested operations. Fields with `@default`, `@createdAt`, or `@updatedAt` are optional. `@now` fields are excluded (computed). |
| `UserNestedCreate`         | Data type for nested creates inside relation operations. Omits the `id` field since SurrealDB auto-generates it.                                                                                                  |
| `UserUpdate`               | Data type for `updateUnique()` / `updateMany()`. All fields optional. Supports array `push`/`unset` and object `merge`/`set` operations.                                                                          |
| `UserWhere`                | Where clause type. Includes comparison operators, logical operators (`AND`, `OR`, `NOT`), nested relation filtering, and object field filtering.                                                                  |
| `UserSelect`               | Field selection type. Each field is `boolean`. Object fields accept `boolean \| ObjectSelect` for sub-field narrowing. Tuple fields with object elements accept `boolean \| TupleSelect`.                         |
| `UserInclude`              | Relation include type. Each relation accepts `boolean` or an object with nested `where`, `select`, `include`, `orderBy`, `limit`, `offset`.                                                                       |
| `UserOrderBy`              | Ordering type. Each field accepts `'asc' \| 'desc'`. Supports nested object field ordering.                                                                                                                       |
| `UserUnset`                | Unset type for `updateMany()`, `updateUnique()`, and `upsert()`. Specifies which optional fields to remove (set to NONE). Supports nested object fields and tuple elements.                                       |
| `UserFindUniqueWhere`      | Where clause for unique lookups. Requires exactly one unique field (typically `id`).                                                                                                                              |
| `User$Relations`           | Relation metadata mapping. Maps relation names to their target model and cardinality.                                                                                                                             |
| `GetUserPayload<S, I>`     | Dynamic return type. Computes the result type based on `select` (`S`) and `include` (`I`) options. See [Dynamic Return Types](dynamic-return-types.md).                                                           |
| `GetUserIncludePayload<I>` | Helper type for resolving included relation types.                                                                                                                                                                |

## Types Generated Per Object

For each `object` in your schema, Cerial generates a smaller set of types. Objects are embedded inline within models — they don't have their own tables, IDs, or relations.

| Type                 | Description                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Address`            | Base interface with all fields typed.                                                                                         |
| `AddressInput`       | Input interface (identical to base for objects without Record fields).                                                        |
| `AddressCreateInput` | Create input where `@default`/`@createdAt`/`@updatedAt` fields are optional and `@now` fields are excluded. Only when needed. |
| `AddressWhere`       | Where clause type for filtering by nested object fields.                                                                      |
| `AddressSelect`      | Sub-field selection type.                                                                                                     |
| `AddressOrderBy`     | Ordering type for nested object fields.                                                                                       |

`ObjectNameCreateInput` is only generated when the object has fields with `@default`, `@now`, `@createdAt`, or `@updatedAt` decorators. In that type, `@default`/`@createdAt`/`@updatedAt` fields become optional (the database fills them if omitted), and `@now` fields are excluded entirely (they are computed). The parent model's `Create` type uses `CreateInput` instead of `Input` for such objects.

Objects do **not** generate: `GetPayload`, `Include`, `Create`, `Update`, or Model-level types. Since objects are embedded, they are always operated on through their parent model.

## Types Generated Per Tuple

For each `tuple` in your schema, Cerial generates a focused set of types. Tuples are fixed-length typed arrays with no ordering support.

| Type               | Description                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Coordinate`       | Output type — a TypeScript tuple type (e.g., `[number, number]`).                                                                          |
| `CoordinateInput`  | Input type — accepts array form, object form (with named/index keys), or mixed.                                                            |
| `CoordinateWhere`  | Where clause type with named keys, index keys, and comparison operators for each element.                                                  |
| `CoordinateUpdate` | Per-element update type — allows updating individual elements without replacing the entire tuple. See [Updating Tuples](../tuples/update). |
| `CoordinateSelect` | Sub-field select type — only generated when the tuple contains object elements at any depth. See [Tuple Select](../tuples/select).         |
| `CoordinateUnset`  | Per-element unset type — only generated when the tuple has optional elements. Allows unsetting individual tuple elements by name or index. |

`CoordinateSelect` is conditionally generated: it only exists when the tuple has object elements (directly or via nested tuples). Primitive-only tuples use simple `boolean` selection on the parent model.

`CoordinateUnset` is conditionally generated: it only exists when the tuple has at least one optional element. If the tuple field itself is optional, the model's `Unset` type accepts `true` (unset entire field) or `CoordinateUnset` (unset specific elements).

Tuples do **not** generate: `OrderBy`, `Create`, `Include`, or `GetPayload` types.

When a tuple is used as a model field, the model's `Update` type includes full-replace (`CoordinateInput`), per-element update (`{ update: CoordinateUpdate }`), and `push`/`set` operations for tuple arrays. The model's `Select` type includes `boolean | CoordinateSelect` when the tuple has object elements at any depth, or just `boolean` otherwise.

## Types Generated Per Literal

For each `literal` in your schema, Cerial generates a focused set of types. Literals are union types representing a fixed set of allowed values.

| Type          | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `{Name}`      | Output type — union of variant values/types                      |
| `{Name}Input` | Input type — only when literal has object/tuple variants         |
| `{Name}Where` | Where filter type with eq/neq/in/notIn (+ conditional operators) |

## Example: Generated Output Interface

Given this schema:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

model User {
  id Record @id
  email String @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @createdAt
  address Address
  shipping Address?
  profileId Record?
  tagIds Record[]
  nicknames String[]
}
```

Cerial generates:

```typescript
export interface User {
  id: CerialId;
  email: string;
  name: string;
  age?: number;
  isActive: boolean;
  createdAt: Date;
  address: Address;
  shipping?: Address;
  profileId?: CerialId;
  tagIds: CerialId[];
  nicknames: string[];
}
```

Key points:

- `id` is `CerialId`, not `string`
- `age` is `number` with `?` (optional) — can be a number or NONE (absent). Add `@nullable` to allow null.
- `isActive` is non-optional in output even though it has `@default` — the default ensures it always has a value
- `shipping` is `Address` with `?` (optional) — object fields use `undefined`, not `| null`
- `profileId` is `CerialId` with `?` — optional record ref can be a value or NONE. Add `@nullable` to allow null.
- `tagIds` and `nicknames` are non-optional arrays — array fields always have a value (default `[]`)

## Example: Generated Create Type

```typescript
export interface UserCreate {
  email: string;
  name: string;
  age?: number;
  isActive?: boolean; // Optional — has @default(true)
  createdAt?: Date; // Optional — has @createdAt
  address: AddressInput;
  shipping?: AddressInput;
  profileId?: RecordIdInput;
  tagIds?: RecordIdInput[]; // Optional — defaults to []
  nicknames?: string[]; // Optional — defaults to []
  // Relation fields use nested operations
  profile?: { create: ProfileNestedCreate } | { connect: RecordIdInput };
  posts?: { create: PostNestedCreate[] } | { connect: RecordIdInput[] };
  tags?: { connect: RecordIdInput[] };
}
```

Key differences from the output interface:

- Fields with `@default`, `@createdAt`, or `@updatedAt` become optional (the database provides a default if omitted)
- Fields with `@now` are excluded (they are computed by the database and cannot be set)
- Array fields become optional (default to `[]`)
- `CerialId` becomes `RecordIdInput` (accepts strings, CerialId, or RecordId)
- Relation fields are replaced with nested `create` / `connect` operations

## Example: Generated Update Type

```typescript
export interface UserUpdate {
  email?: string;
  name?: string;
  age?: number | typeof NONE;
  isActive?: boolean;
  address?: AddressInput | { set: AddressInput };
  shipping?: AddressInput | { set: AddressInput };
  profileId?: RecordIdInput | typeof NONE;
  tagIds?: RecordIdInput[];
  nicknames?: string[] | { push: string | string[] } | { unset: string | string[] };
  // Relation fields use update operations
  profile?: { create: ProfileNestedCreate } | { connect: RecordIdInput } | { disconnect: true };
  posts?:
    | { create: PostNestedCreate | PostNestedCreate[] }
    | { connect: RecordIdInput | RecordIdInput[] }
    | { disconnect: RecordIdInput | RecordIdInput[] };
  tags?: { connect: RecordIdInput | RecordIdInput[] } | { disconnect: RecordIdInput | RecordIdInput[] };
}
```

Key features:

- All fields are optional (only update what you need)
- Optional fields accept `NONE` sentinel to remove the field (set to NONE in SurrealDB)
- `@nullable` fields also accept `null` to set the field to null
- Object fields accept partial data (merge) or `{ set: ... }` (full replacement)
- Array primitive fields support `{ push: ... }` and `{ unset: ... }` (value-based removal)
- Relation fields support `create`, `connect`, and `disconnect` operations

## Example: Generated Unset Type

```typescript
export interface UserUnset {
  age?: true; // optional primitive — can be unset
  shipping?: true | { zipCode?: true }; // optional object with optional children — unset whole or nested
  address?: { zipCode?: true }; // required object with optional children — only nested unset
  // Required primitives, arrays, relations, @readonly, and id are NOT included
}
```

Key features:

- Only optional fields or fields with optional children appear in `Unset`
- `true` means "unset this entire field" (set to NONE in SurrealDB)
- Object fields with optional children allow nested unset: `{ subField: true }`
- Required objects with optional children only allow nested form (can't unset a required field)
- `@readonly` fields, relations, arrays, and `id` are excluded
- TypeScript prevents conflicts between `data` and `unset` using the `SafeUnset<Unset, Data>` utility type

## Example: Generated Where Type

```typescript
export interface UserWhere {
  id?: RecordIdInput | RecordIdInput[];
  email?:
    | string
    | {
        eq?: string;
        neq?: string;
        contains?: string;
        startsWith?: string;
        endsWith?: string;
        in?: string[];
        notIn?: string[];
      };
  name?:
    | string
    | {
        eq?: string;
        neq?: string;
        contains?: string;
        startsWith?: string;
        endsWith?: string;
        in?: string[];
        notIn?: string[];
      };
  age?:
    | number
    | {
        eq?: number;
        neq?: number;
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
        in?: number[];
        notIn?: number[];
        isNone?: boolean; // available because age is optional (?)
        isDefined?: boolean; // alias for !isNone
      };
  isActive?: boolean | { eq?: boolean; neq?: boolean };
  address?: AddressWhere;
  shipping?: AddressWhere | { isNone?: boolean };
  nicknames?: { has?: string; hasAll?: string[]; hasAny?: string[]; isEmpty?: boolean };
  // Relation filtering
  profile?: ProfileWhere | { is?: ProfileWhere; isNot?: ProfileWhere };
  posts?: { some?: PostWhere; every?: PostWhere; none?: PostWhere };
  tags?: { some?: TagWhere; every?: TagWhere; none?: TagWhere };
  // Logical operators
  AND?: UserWhere[];
  OR?: UserWhere[];
  NOT?: UserWhere;
}
```

Key features:

- Scalar fields accept a direct value (shorthand for `{ eq: value }`) or an operator object
- Object fields accept their nested `Where` type for filtering by sub-fields
- Relation fields support `is`/`isNot` for singular and `some`/`every`/`none` for arrays
- `AND`, `OR`, `NOT` for composing complex conditions

## Example: Generated Select and Include Types

```typescript
export interface UserSelect {
  id?: boolean;
  email?: boolean;
  name?: boolean;
  age?: boolean;
  isActive?: boolean;
  createdAt?: boolean;
  address?: boolean | AddressSelect; // true = full, object = sub-fields
  shipping?: boolean | AddressSelect;
  profileId?: boolean;
  tagIds?: boolean;
  nicknames?: boolean;
}

export interface UserInclude {
  profile?:
    | boolean
    | {
        select?: ProfileSelect;
        include?: ProfileInclude;
        where?: ProfileWhere;
      };
  posts?:
    | boolean
    | {
        select?: PostSelect;
        include?: PostInclude;
        where?: PostWhere;
        orderBy?: PostOrderBy;
        limit?: number;
        offset?: number;
      };
  tags?:
    | boolean
    | {
        select?: TagSelect;
        include?: TagInclude;
        where?: TagWhere;
        orderBy?: TagOrderBy;
        limit?: number;
        offset?: number;
      };
}
```

Key features:

- `select` fields are `boolean` — `true` to include, `false` to exclude
- Object fields in `select` accept `boolean | ObjectSelect` for sub-field narrowing
- `include` relation entries accept `boolean` (simple include) or an object with nested query options
- Array relations in `include` support `where`, `orderBy`, `limit`, and `offset` for filtering and pagination

## Generated Literal Types

For a literal definition:

```cerial
literal Status { 'active', 'inactive', 'pending' }
```

Cerial generates:

```typescript
type Status = 'active' | 'inactive' | 'pending';

interface StatusWhere {
  eq?: Status;
  neq?: Status;
  in?: Status[];
  notIn?: Status[];
}
```

Key points:

- Literals with object/tuple variants also generate an `Input` type (uses input variants for objects/tuples)
- Numeric-only literals get additional comparison operators (`gt`, `gte`, `lt`, `lte`, `between`)
- Literals with broad `String` type get string operators (`contains`, `startsWith`, `endsWith`)
- Literal fields are excluded from `OrderBy` types
- Literal fields use boolean-only select (no sub-field selection)

## CerialQueryPromise

All model methods return `CerialQueryPromise<T>` instead of `Promise<T>`. It works exactly like a regular Promise — you can `await` it, call `.then()`, `.catch()`, and `.finally()` as usual. Additionally, it can be passed to [`$transaction`](../queries/transaction.md) for atomic batched execution.

```typescript
// Works like a normal Promise
const user = await client.db.User.findOne({ where: { id: '123' } });

// Or collect multiple queries for atomic execution
const [user, posts] = await client.$transaction([
  client.db.User.findOne({ where: { id: '123' } }),
  client.db.Post.findMany({ where: { published: true } }),
]);
```

It is re-exported from the generated client, so you can import it for type annotations:

```typescript
import { CerialQueryPromise } from './db-client';
```

## Generated File Structure

All types are generated into the output directory (typically `db-client/` or a configured path). Models, objects, and tuples each get their own directory:

```
db-client/
├── client.ts               # CerialClient class with Model proxies
├── models/                  # Model types (User, UserCreate, UserWhere, ...)
│   ├── user.ts
│   ├── post.ts
│   ├── profile.ts
│   └── index.ts
├── objects/                 # Object types (Address, AddressInput, AddressWhere, ...)
│   ├── address.ts
│   └── index.ts
├── tuples/                  # Tuple types (Coordinate, CoordinateInput, CoordinateWhere, ...)
│   ├── coordinate.ts
│   └── index.ts
├── internal/
│   ├── model-registry.ts    # Runtime model metadata (fields, relations, types)
│   └── migrations.ts        # DEFINE TABLE / DEFINE FIELD statements
└── index.ts                 # Re-exports all public types and client
```
