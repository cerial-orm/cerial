---
title: Select
parent: Objects
nav_order: 4
---

# Sub-Field Selection on Objects

Object fields support sub-field selection in `select` options. This allows you to retrieve only the specific nested fields you need, with full type safety.

## Boolean Selection

Passing `true` for an object field returns the full object type with all its fields:

```typescript
const user = await db.User.findOne({
  select: { name: true, address: true },
});
// user.address: Address (full object with all fields)
// user.address.street  ✓
// user.address.city    ✓
// user.address.state   ✓
// user.address.zipCode ✓
```

## Object Sub-Field Selection

Passing an object with specific fields set to `true` returns only those fields — the return type is narrowed accordingly:

```typescript
const user = await db.User.findOne({
  select: { name: true, address: { city: true, state: true } },
});
// user.address: { city: string; state: string }
// user.address.city   ✓
// user.address.state  ✓
// user.address.street — type error, not selected
```

Only the fields you specify in the select object are included in the return type. Accessing unselected fields produces a TypeScript compile-time error.

## Array of Objects

Sub-field selection works on array object fields as well. The narrowing applies to each element of the array:

```typescript
const user = await db.User.findOne({
  select: { locations: { lat: true } },
});
// user.locations: { lat: number }[]
// Each element only has the `lat` field in the type
```

## Optional Object Fields

When an optional object field is selected with sub-field narrowing, the `| undefined` is preserved:

```typescript
const user = await db.User.findOne({
  select: { shipping: { city: true } },
});
// user.shipping: { city: string } | undefined
```

If the record has no `shipping` value (NONE), the field is `undefined`. If it does have a value, only the selected sub-fields are present in the type.

## How It Works

The type-level machinery behind sub-field selection uses two utility types:

- **`ResolveFieldSelect<FieldType, SelectValue>`** — Resolves the return type for a given field and select value.
  - When `SelectValue` is `true`, it returns the full `FieldType`.
  - When `SelectValue` is an object like `{ city: true, state: true }`, it delegates to `ApplyObjectSelect`.

- **`ApplyObjectSelect<T, S>`** — Recursively applies the sub-field selection to an object type, producing a narrowed type with only the selected fields.

Optional fields preserve `| undefined` through the narrowing process, so type safety is maintained regardless of selection depth.

## Select Within Include

When using `select` inside an `include` clause for related models, the select is **type-level only** — the runtime returns full related objects. This is a deliberate design choice since related records are fetched as complete entities.

```typescript
const user = await db.User.findOne({
  include: {
    posts: {
      select: { title: true },
    },
  },
});
// TypeScript type: user.posts[n] has only { title: string }
// Runtime: full Post objects are returned
```
