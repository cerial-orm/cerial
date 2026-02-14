---
title: Select
parent: Tuples
nav_order: 5
---

# Sub-Field Selection on Tuples

Tuples that contain object elements (at any nesting depth) support sub-field selection in `select` options. This allows you to narrow which fields are returned from embedded objects within tuples, with full type safety.

Primitive-only tuples (e.g., `tuple Coordinate { lat Float, lng Float }`) do not support sub-field selection — they use `boolean` selection like any scalar field.

## Boolean Selection

Passing `true` for a tuple field returns the full tuple with all elements and all object fields:

```typescript
const user = await db.User.findOne({
  select: { name: true, place: true },
});
// user.place: [string, Address]  (full tuple, all Address fields included)
```

## Tuple Sub-Field Selection

For tuples with object elements, you can pass a select object to narrow the object sub-fields. Only object and tuple-with-object elements appear in the select type — primitive elements are always included in full.

```cerial
object Address {
  street String
  city String
}

tuple Located {
  tag String,
  Address
}

model Place {
  id Record @id
  place Located
}
```

```typescript
const place = await db.Place.findOne({
  select: { place: { 1: { city: true } } },
});
// place.place: [string, { city: string }]
// place.place[0]        ✓  (primitive — always full)
// place.place[1].city   ✓  (selected)
// place.place[1].street — type error, not selected
```

The select key is the element index (`1`) or the element name if one exists.

## Named Element Keys

When tuple elements have names, you can use either the name or the index as the select key:

```cerial
tuple Located {
  tag String,
  addr Address
}
```

```typescript
// Using named key
const p = await db.Place.findOne({
  select: { place: { addr: { city: true } } },
});

// Using index key — equivalent
const p2 = await db.Place.findOne({
  select: { place: { 1: { city: true } } },
});
```

## Nested Tuples with Objects

Sub-field selection works at arbitrary nesting depth. If a tuple contains another tuple that contains an object, you can narrow the innermost object's fields:

```cerial
object Info {
  name String
  note String
}

tuple Inner {
  label String,
  Info
}

tuple Outer {
  id Int,
  Inner
}

model Deep {
  id Record @id
  data Outer
}
```

```typescript
const d = await db.Deep.findOne({
  select: {
    data: {
      1: {
        1: { name: true },
      },
    },
  },
});
// d.data: [number, [string, { name: string }]]
// d.data[1][1].name  ✓
// d.data[1][1].note  — type error, not selected
// d.data[0]          ✓  (primitive — always full)
// d.data[1][0]       ✓  (primitive — always full)
```

## Optional Tuple Fields

When an optional tuple field is selected with sub-field narrowing, the `| undefined` is preserved:

```typescript
const user = await db.User.findOne({
  select: { optionalPlace: { 1: { city: true } } },
});
// user.optionalPlace: [string, { city: string }] | undefined
```

## When Select Types Are Generated

A `TupleSelect` type is only generated for tuples that contain object elements at any nesting depth. Primitive-only tuples always use simple `boolean` selection.

```typescript
// Generated for `tuple Located { tag String, Address }`
export type LocatedSelect = {
  1?: boolean | AddressSelect;
  addr?: boolean | AddressSelect; // if the element is named
};
```

The model's `Select` type includes the tuple select option:

```typescript
export interface PlaceSelect {
  id?: boolean;
  place?: boolean | LocatedSelect; // boolean = full, object = sub-field narrowing
}
```

## How It Works

The type-level machinery uses three utility types:

- **`ResolveFieldSelect<FieldType, SelectValue>`** — Resolves the return type for a field. For tuples, it checks `IsTuple<FieldType>` and delegates to `ApplyTupleSelect` when the select value is an object.

- **`ApplyTupleSelect<T, S>`** — Maps over tuple elements. Elements with a select key in `S` get their sub-fields narrowed via `ResolveFieldSelect`; elements without a select key pass through unchanged.

- **`IsTuple<T>`** — Distinguishes fixed-length tuples from regular arrays, so `ApplyTupleSelect` is only applied to tuples (not `Array<T>`).
