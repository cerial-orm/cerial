---
title: Optional Fields
parent: Schema
nav_order: 3
---

# Optional Fields

Appending `?` to a field type makes it optional. Optional fields can be omitted on create and cleared on update. They can be absent (NONE) but **not** null — use [`@nullable`](decorators/nullable) to allow null values.

## Syntax

```cerial
model User {
  id Record @id
  name String           # required
  bio String?           # optional (value or NONE)
  age Int?              # optional
  address Address?      # optional embedded object
  profileId Record?     # optional record reference
}
```

## TypeScript Type Mapping

Optional fields produce different TypeScript types depending on the field kind and whether `@nullable` is used:

| Schema              | TypeScript Output               | Notes                           |
| ------------------- | ------------------------------- | ------------------------------- |
| `String?`           | `string \| undefined`           | Optional — value or NONE        |
| `String @nullable`  | `string \| null`                | Nullable — value or null        |
| `String? @nullable` | `string \| null \| undefined`   | Both — value, null, or NONE     |
| `Address?`          | `Address \| undefined`          | Object optional — NO `\| null`  |
| `Record?`           | `CerialId \| undefined`         | Optional record — value or NONE |
| `Record? @nullable` | `CerialId \| null \| undefined` | Optional nullable record        |

Key differences:

- **Optional fields (`?`)** produce `type | undefined` — the field can be present or absent (NONE), but not null.
- **Nullable fields (`@nullable`)** add `| null` — the field can hold an explicit null value.
- **Optional object fields** (`Address?`) produce `type | undefined` only — objects do not support `null` or `@nullable`.
- **Optional Record fields** (`Record?`) produce `CerialId | undefined` by default. Add `@nullable` to allow null.

## NONE vs null

SurrealDB distinguishes between two kinds of "empty":

- **NONE** — The field does not exist on the record (absent). In TypeScript, this maps to `undefined`.
- **null** — The field exists and its value is explicitly `null`. In TypeScript, this maps to `null`. Requires `@nullable`.

```typescript
// Schema: bio String? — optional only, no @nullable
await db.User.create({
  data: { name: 'Alice' },
  // bio is omitted → NONE (field absent in DB)
});

await db.User.create({
  data: { name: 'Bob', bio: 'Hello' },
  // bio = 'Hello'
});

// Schema: bio String? @nullable — optional and nullable
await db.User.create({
  data: { name: 'Carol', bio: null },
  // bio = null (explicit null stored in DB)
});
```

This distinction affects queries:

```typescript
// Find users where bio IS NONE (field absent) — requires ?
await db.User.findMany({ where: { bio: { isNone: true } } });

// Find users where bio IS null — requires @nullable
await db.User.findMany({ where: { bio: { isNull: true } } });

// Find users where bio is present (could be null or a string) — requires ?
await db.User.findMany({ where: { bio: { isNone: false } } });
```

See [NONE vs null](../types/none-vs-null) for the full reference on how these states interact.

## The `@default(null)` Pattern

By default, omitting an optional field stores NONE. If you want omitting to store `null` instead, use `@default(null)` with `@nullable`:

```cerial
model User {
  id Record @id
  bio String?                               # omit → NONE
  nickname String? @nullable @default(null)  # omit → null
}
```

```typescript
// Without @default(null): omitting = NONE
// With @default(null): omitting = null (default applied)
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
