---
title: Object Sub-Select
parent: Select & Include
nav_order: 2
---

# Object Sub-Select

Embedded object fields support sub-field selection within the `select` option. This lets you narrow an object type down to only the fields you need, with full type safety.

## Two Selection Modes

### Boolean `true` — Full Object

Passing `true` for an object field returns the complete object type with all its fields:

```typescript
const user = await db.User.findOne({
  select: { name: true, address: true },
});
// user: { name: string; address: Address } | null
// user.address has all fields: street, city, state, zipCode
```

### Object Select — Narrowed Sub-Fields

Passing an object with sub-field keys set to `true` returns only those sub-fields:

```typescript
const user = await db.User.findOne({
  select: { name: true, address: { city: true, state: true } },
});
// user: { name: string; address: { city: string; state: string } } | null
// user.address.street would be a TypeScript compile error!
```

Only the specified sub-fields are included in the return type. Unmentioned sub-fields are excluded from both the result and the type.

## Array of Objects

When an object field is an array, the sub-select applies to each element in the array:

```typescript
const user = await db.User.findOne({
  select: { locations: { lat: true } },
});
// user: { locations: { lat: number }[] } | null
```

Each element in the `locations` array is narrowed to only contain `lat`. The array wrapper is preserved.

## Optional Object Fields

Optional object fields preserve their `| undefined` optionality through sub-field selection:

```typescript
const user = await db.User.findOne({
  select: { shipping: { city: true } },
});
// user: { shipping: { city: string } | undefined } | null
```

Note that optional object fields use `| undefined` (not `| null`), which differs from optional primitive fields. This is because embedded objects in SurrealDB are either present or absent (`NONE`), never explicitly `null`.

## Nested Objects

If an object contains another embedded object, you can sub-select through multiple levels:

```typescript
const user = await db.User.findOne({
  select: {
    locations: {
      label: { city: true },
      lat: true,
    },
  },
});
// user: { locations: { label: { city: string }; lat: number }[] } | null
```

## Type-Level Machinery

The sub-field selection is powered by two generated utility types:

- **`ResolveFieldSelect<FieldType, SelectValue>`** — Resolves the return type for a single field based on its select value:
  - `ResolveFieldSelect<Address, true>` returns `Address` (full type)
  - `ResolveFieldSelect<Address, { city: true; state: true }>` returns `{ city: string; state: string }` via `ApplyObjectSelect`

- **`ApplyObjectSelect<T, S>`** — Recursively applies sub-field selection to an object type, producing a new type with only the selected fields

Optional fields preserve `| undefined` through the resolution chain. Array fields preserve their `[]` wrapper.

## SurrealQL Generation

At the SurrealQL level, sub-field selects generate dot-notation field paths:

```sql
-- select: { address: { city: true, state: true } }
SELECT address.city, address.state FROM user WHERE ...

-- select: { locations: { lat: true } }
SELECT locations.lat FROM user WHERE ...
```

This is handled by the select builder in `src/query/builders/select-builder.ts`, which expands object sub-selects into `field.subField` syntax.
