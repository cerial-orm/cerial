---
title: '@nullable'
parent: Decorators
grand_parent: Schema
nav_order: 3.5
---

# @nullable

Marks a field as accepting an explicit `null` value. Without `@nullable`, optional fields can only be a typed value or NONE (absent) — never `null`.

## Syntax

```cerial
field Type @nullable       # required but nullable: value or null
field Type? @nullable      # optional and nullable: value, null, or NONE
```

## The Three-State Model

Cerial cleanly separates SurrealDB's three field states:

| Schema                  | TypeScript Output      | Allowed Values       | Migration                     |
| ----------------------- | ---------------------- | -------------------- | ----------------------------- |
| `name String`           | `name: string`         | value                | `TYPE string`                 |
| `bio String?`           | `bio?: string`         | value or NONE        | `TYPE option<string>`         |
| `bio String @nullable`  | `bio: string \| null`  | value or null        | `TYPE string \| null`         |
| `bio String? @nullable` | `bio?: string \| null` | value, null, or NONE | `TYPE option<string \| null>` |

- **`?` (optional)** = the field can be absent (NONE). In TypeScript, this maps to `undefined`.
- **`@nullable`** = the field can hold an explicit `null` value. In TypeScript, this maps to `| null`.
- **Both** = the field can be a value, `null`, or absent.

## Basic Usage

```cerial
model User {
  id Record @id
  name String                 # required, never null
  bio String? @nullable       # optional and nullable
  deletedAt Date @nullable    # required but nullable (soft delete)
}
```

```typescript
// deletedAt is required — always present in output, can be null
const user = await db.User.create({
  data: { name: 'Alice', deletedAt: null },
});
// user.deletedAt: Date | null → null

// bio is optional and nullable — can be omitted, null, or a string
const user2 = await db.User.create({
  data: { name: 'Bob' },
});
// user2.bio: string | null | undefined → undefined (NONE)
```

## On Record Fields

`@nullable` is commonly used on optional Record fields (foreign keys) to distinguish between "no relation" (null) and "field not set yet" (NONE):

```cerial
model Post {
  id Record @id
  title String
  authorId Record? @nullable
  author Relation? @field(authorId) @model(User)
}
```

```typescript
// Create without author — authorId is NONE (absent)
const draft = await db.Post.create({ data: { title: 'Draft' } });

// Create with explicit null — authorId is null (unassigned)
const orphan = await db.Post.create({
  data: { title: 'Orphan', authorId: null },
});

// Query by null (find unassigned posts)
const unassigned = await db.Post.findMany({
  where: { authorId: { isNull: true } },
});

// Query by NONE (find posts without authorId set at all)
const noField = await db.Post.findMany({
  where: { authorId: { isNone: true } },
});
```

Without `@nullable`, `Record?` only supports value or NONE — setting it to `null` would be a validation error.

## Disconnect Behavior

The `@nullable` decorator affects how `disconnect` works on relations:

| Schema                     | Disconnect sets FK to    | Rationale                                 |
| -------------------------- | ------------------------ | ----------------------------------------- |
| `Record?` (no `@nullable`) | NONE (field removed)     | Field can only be value or absent         |
| `Record? @nullable`        | NULL (field set to null) | Field supports null, so null is preferred |

## Default @onDelete Behavior

`@nullable` also affects the default `@onDelete` action for optional relations:

| Schema                     | Default @onDelete | Description               |
| -------------------------- | ----------------- | ------------------------- |
| `Record?` (no `@nullable`) | `SetNone`         | FK removed (field absent) |
| `Record? @nullable`        | `SetNull`         | FK set to null            |

You can always override with an explicit `@onDelete(Action)`.

## Where Operators

The available null/none operators depend on the field's modifiers:

| Schema                             | `isNull` | `isNone` | `isDefined` |
| ---------------------------------- | -------- | -------- | ----------- |
| `String` (required)                | No       | No       | No          |
| `String?` (optional only)          | No       | Yes      | Yes         |
| `String @nullable` (nullable only) | Yes      | No       | No          |
| `String? @nullable` (both)         | Yes      | Yes      | Yes         |

## Restrictions

`@nullable` is **not allowed** on:

- **Object fields** — SurrealDB cannot define sub-fields on a nullable object parent (`object | null`). Use `?` for optional objects instead.
- **Tuple fields** — Same limitation as objects. Use `?` for optional tuples.
- **Tuple elements** — `@nullable` IS allowed on individual tuple elements (e.g., `float @nullable`), since SurrealDB supports `float | null` as an element type.

```cerial
# Valid
tuple Coordinate {
  x Float
  y Float
  z Float? @nullable    # element can be value, null, or NONE
}

# Invalid — @nullable on object/tuple field
model Bad {
  address Address @nullable    # Error: @nullable not allowed on object fields
  coord Coordinate @nullable   # Error: @nullable not allowed on tuple fields
}
```

## With @default

`@default(null)` requires `@nullable` on the field. Without it, a null default makes no sense since the field can't hold null:

```cerial
model User {
  id Record @id
  bio String? @nullable @default(null)    # Valid — omit → null stored
  bio String? @default(null)              # Error — field is not nullable
}
```

## Mutual Exclusivity

`@nullable` can be combined with most other decorators. It is incompatible with:

- `@now` — computed fields have no stored value to be null
- `@id` — the primary record identifier cannot be null

## See Also

- [Optional Fields](../optional-fields) — How `?` works for optional (NONE) fields
- [NONE vs null](../../types/none-vs-null) — Full reference on the three-state model
- [Special Operators](../../filtering/special-operators) — `isNull`, `isNone`, `isDefined` operators
- [Delete Behavior](../../relations/on-delete) — How `@nullable` affects `@onDelete` defaults
