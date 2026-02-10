---
title: Optional Fields
parent: Schema
nav_order: 3
---

# Optional Fields

Appending `?` to a field type makes it optional. Optional fields can be omitted on create and cleared on update.

## Syntax

```cerial
model User {
  id Record @id
  name String           # required
  bio String?           # optional
  age Int?              # optional
  address Address?      # optional embedded object
  profileId Record?     # optional record reference
}
```

## TypeScript Type Mapping

Optional fields produce different TypeScript types depending on the field kind:

| Schema     | TypeScript Type                 | Notes                           |
| ---------- | ------------------------------- | ------------------------------- |
| `String?`  | `string \| null \| undefined`   | Primitive optional              |
| `Int?`     | `number \| null \| undefined`   | Primitive optional              |
| `Float?`   | `number \| null \| undefined`   | Primitive optional              |
| `Bool?`    | `boolean \| null \| undefined`  | Primitive optional              |
| `Date?`    | `Date \| null \| undefined`     | Primitive optional              |
| `Email?`   | `string \| null \| undefined`   | Primitive optional              |
| `Address?` | `Address \| undefined`          | Object optional — NO `\| null`  |
| `Record?`  | `CerialId \| null \| undefined` | null treated as NONE at runtime |

Key differences:

- **Optional primitive fields** (`String?`, `Int?`, etc.) produce `type | null | undefined` — both `null` and `undefined` (NONE) are meaningful.
- **Optional object fields** (`Address?`) produce `type | undefined` only — objects do not support `null`, only presence or absence.
- **Optional Record fields** (`Record?`) produce `CerialId | null | undefined` in the type system, but at runtime `null` is treated the same as `undefined` (NONE). Record references cannot be null — they either point to a record or are absent.

## NONE vs null

SurrealDB distinguishes between two kinds of "empty":

- **NONE** — The field does not exist on the record (absent). In TypeScript, this maps to `undefined`.
- **null** — The field exists and its value is explicitly `null`. In TypeScript, this maps to `null`.

```typescript
// NONE: field is not stored
await db.User.create({
  data: { name: 'Alice' },
  // bio is omitted → NONE (field absent in DB)
});

// null: field is stored with null value
await db.User.create({
  data: { name: 'Bob', bio: null },
  // bio is explicitly null → stored as null in DB
});
```

This distinction affects queries:

```typescript
// Find users where bio IS null (not NONE)
await db.User.findMany({ where: { bio: { eq: null } } });

// Find users where bio IS NONE (field absent)
await db.User.findMany({ where: { bio: { isNone: true } } });

// Find users where bio is present (could be null or a string)
await db.User.findMany({ where: { bio: { isNone: false } } });
```

## The `@default(null)` Pattern

By default, omitting an optional field stores NONE. If you want omitting to store `null` instead, use `@default(null)`:

```cerial
model User {
  id Record @id
  bio String?                  # omit → NONE
  nickname String? @default(null)   # omit → null
}
```

```typescript
// Without @default(null): omitting = NONE
await db.User.create({ data: { name: 'Alice' } });
// bio: NONE (absent), nickname: null (default applied)
```

See [@default](decorators/default) for more on default values.

## Required vs Optional

```cerial
model Example {
  id Record @id
  required String        # must be provided on create
  optional String?       # can be omitted on create
}
```

```typescript
// This works
await db.Example.create({
  data: { required: 'hello' },
});

// This is a type error — 'required' is missing
await db.Example.create({
  data: { optional: 'world' },
});
```
