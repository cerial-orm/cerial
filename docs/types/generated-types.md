---
title: Generated Types
parent: Type System
nav_order: 3
---

# Generated Types

Cerial generates a comprehensive set of TypeScript types for every model and object in your schema. These types power autocompletion, compile-time validation, and runtime type safety across all query operations.

## Types Generated Per Model

For each model in your schema, Cerial generates the following types:

| Type                       | Description                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                     | Base output interface. All fields use output types (`CerialId` for records, `Date` for datetimes).                                                      |
| `UserInput`                | Base input interface. Record fields use `RecordIdInput` instead of `CerialId`.                                                                          |
| `UserCreate`               | Data type for `create()`. Derives from `UserInput` with relation fields replaced by nested operations. Fields with `@default` are optional.             |
| `UserNestedCreate`         | Data type for nested creates inside relation operations. Omits the `id` field since SurrealDB auto-generates it.                                        |
| `UserUpdate`               | Data type for `updateUnique()` / `updateMany()`. All fields optional. Supports array `push`/`unset` and object `merge`/`set` operations.                |
| `UserWhere`                | Where clause type. Includes comparison operators, logical operators (`AND`, `OR`, `NOT`), nested relation filtering, and object field filtering.        |
| `UserSelect`               | Field selection type. Each field is `boolean`. Object fields accept `boolean \| ObjectSelect` for sub-field narrowing.                                  |
| `UserInclude`              | Relation include type. Each relation accepts `boolean` or an object with nested `where`, `select`, `include`, `orderBy`, `limit`, `offset`.             |
| `UserOrderBy`              | Ordering type. Each field accepts `'asc' \| 'desc'`. Supports nested object field ordering.                                                             |
| `UserFindUniqueWhere`      | Where clause for unique lookups. Requires exactly one unique field (typically `id`).                                                                    |
| `User$Relations`           | Relation metadata mapping. Maps relation names to their target model and cardinality.                                                                   |
| `GetUserPayload<S, I>`     | Dynamic return type. Computes the result type based on `select` (`S`) and `include` (`I`) options. See [Dynamic Return Types](dynamic-return-types.md). |
| `GetUserIncludePayload<I>` | Helper type for resolving included relation types.                                                                                                      |

## Types Generated Per Object

For each `object` in your schema, Cerial generates a smaller set of types. Objects are embedded inline within models — they don't have their own tables, IDs, or relations.

| Type             | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `Address`        | Base interface with all fields typed.                                  |
| `AddressInput`   | Input interface (identical to base for objects without Record fields). |
| `AddressWhere`   | Where clause type for filtering by nested object fields.               |
| `AddressSelect`  | Sub-field selection type.                                              |
| `AddressOrderBy` | Ordering type for nested object fields.                                |

Objects do **not** generate: `GetPayload`, `Include`, `Create`, `Update`, or Model-level types. Since objects are embedded, they are always operated on through their parent model.

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
  createdAt Date @now
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
  age?: number | null;
  isActive: boolean;
  createdAt: Date;
  address: Address;
  shipping?: Address;
  profileId?: CerialId | null;
  tagIds: CerialId[];
  nicknames: string[];
}
```

Key points:

- `id` is `CerialId`, not `string`
- `age` is `number | null` with `?` (optional) — can be NONE or null
- `isActive` is non-optional in output even though it has `@default` — the default ensures it always has a value
- `shipping` is `Address` with `?` (optional) — object fields use `undefined`, not `| null`
- `profileId` is `CerialId | null` with `?` — record refs can be NONE or null in types (though null becomes NONE at runtime)
- `tagIds` and `nicknames` are non-optional arrays — array fields always have a value (default `[]`)

## Example: Generated Create Type

```typescript
export interface UserCreate {
  email: string;
  name: string;
  age?: number | null;
  isActive?: boolean; // Optional — has @default(true)
  createdAt?: Date; // Optional — has @now
  address: AddressInput;
  shipping?: AddressInput;
  profileId?: RecordIdInput | null;
  tagIds?: RecordIdInput[]; // Optional — defaults to []
  nicknames?: string[]; // Optional — defaults to []
  // Relation fields use nested operations
  profile?: { create: ProfileNestedCreate } | { connect: RecordIdInput };
  posts?: { create: PostNestedCreate[] } | { connect: RecordIdInput[] };
  tags?: { connect: RecordIdInput[] };
}
```

Key differences from the output interface:

- Fields with `@default` become optional (the default is applied if omitted)
- Array fields become optional (default to `[]`)
- `CerialId` becomes `RecordIdInput` (accepts strings, CerialId, or RecordId)
- Relation fields are replaced with nested `create` / `connect` operations

## Example: Generated Update Type

```typescript
export interface UserUpdate {
  email?: string;
  name?: string;
  age?: number | null;
  isActive?: boolean;
  address?: AddressInput | { set: AddressInput };
  shipping?: AddressInput | { set: AddressInput };
  profileId?: RecordIdInput | null;
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
- Object fields accept partial data (merge) or `{ set: ... }` (full replacement)
- Array primitive fields support `{ push: ... }` and `{ unset: ... }` (value-based removal)
- Relation fields support `create`, `connect`, and `disconnect` operations

## Example: Generated Where Type

```typescript
export interface UserWhere {
  id?: RecordIdInput | RecordIdInput[];
  email?:
    | string
    | {
        eq?: string | null;
        neq?: string | null;
        contains?: string;
        startsWith?: string;
        endsWith?: string;
        in?: string[];
        notIn?: string[];
        isNone?: boolean;
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
        eq?: number | null;
        neq?: number | null;
        gt?: number;
        gte?: number;
        lt?: number;
        lte?: number;
        in?: number[];
        notIn?: number[];
        isNone?: boolean;
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

All types are generated into the output directory (typically `db-client/` or a configured path):

```
db-client/
├── client.ts               # CerialClient class with Model proxies
├── models/
│   ├── user.ts              # User, UserInput, UserCreate, UserUpdate, UserWhere,
│   │                        #   UserSelect, UserInclude, UserOrderBy, GetUserPayload, ...
│   ├── post.ts              # Post types...
│   ├── profile.ts           # Profile types...
│   └── address.ts           # Address, AddressInput, AddressWhere, AddressSelect, AddressOrderBy
├── internal/
│   ├── model-registry.ts    # Runtime model metadata (fields, relations, types)
│   └── migrations.ts        # DEFINE TABLE / DEFINE FIELD statements
└── index.ts                 # Re-exports all public types and client
```
