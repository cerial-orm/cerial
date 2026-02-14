---
title: Updating Tuples
parent: Tuples
nav_order: 4
---

# Updating Tuples

Tuple fields support two update strategies: **full replacement** (replace the entire tuple) and **per-element update** (update individual elements without touching the rest).

## Full Replacement

Pass an array to replace the entire tuple value:

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: { location: [99.0, 88.0] },
});
```

## Per-Element Update

Pass an object to update individual elements without replacing the entire tuple. Elements you don't specify remain unchanged:

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  location Coordinate
}
```

```typescript
// Update only lat, keep lng unchanged
await db.User.updateUnique({
  where: { id: userId },
  data: { location: { lat: 99.0 } },
});

// Update by index key
await db.User.updateUnique({
  where: { id: userId },
  data: { location: { 0: 99.0 } },
});
```

The disambiguation rule is simple: **array = full replace, object = per-element update**. This applies at all levels — model fields and nested tuples alike.

### Object Elements: Merge Semantics

When a tuple contains object elements, the per-element update merges object fields (like regular object updates):

```cerial
object Address {
  street String
  city String
}

tuple Located {
  tag String,
  Address
}
```

```typescript
// Merge: update only city, keep street unchanged
await db.Place.updateUnique({
  where: { id: placeId },
  data: { place: { 1: { city: 'NYC' } } },
});

// Full replace the object element with { set: ... }
await db.Place.updateUnique({
  where: { id: placeId },
  data: { place: { 1: { set: { street: '5th Ave', city: 'NYC' } } } },
});
```

### Nested Tuple Elements: Recursive Per-Element Update

When a tuple contains another tuple, the same array/object disambiguation applies recursively. Array = full replace, object = per-element update:

```cerial
tuple Inner {
  x Int,
  y Int
}

tuple Outer {
  label String,
  Inner
}
```

```typescript
// Update only the inner tuple's x, keep label and y unchanged
// Object value = per-element update
await db.Model.updateUnique({
  where: { id: recordId },
  data: { data: { 1: { x: 42 } } },
});

// Full-replace just the inner tuple element
// Array value = full replace
await db.Model.updateUnique({
  where: { id: recordId },
  data: { data: { 1: [42, 99] } },
});
```

### Optional Elements: NONE

For tuples with optional elements, pass `NONE` to clear an element (set it to absent):

```typescript
import { NONE } from './db-client';

await db.Model.updateUnique({
  where: { id: recordId },
  data: { tuple: { 1: NONE } },
});
```

After clearing, that element position will be `undefined` in the output.

## Optional Tuple: Clear with NONE

For optional tuple fields, pass `NONE` to remove the value:

```typescript
import { NONE } from './db-client';

await db.User.updateUnique({
  where: { id: userId },
  data: { backup: NONE },
});
```

After clearing, the field will be absent from the result (`undefined`).

## Unsetting with the `unset` Parameter

Instead of importing `NONE` and passing it in `data`, you can use the `unset` parameter on `updateMany`, `updateUnique`, and `upsert` to declaratively remove optional tuple elements and fields:

### Unsetting Tuple Elements

```typescript
// Clear optional element by name or index
await db.Model.updateUnique({
  where: { id: recordId },
  data: {},
  unset: { location: { altitude: true } },
});

// Equivalent to: data: { location: { altitude: NONE } }
```

### Unsetting Optional Tuple Fields

```typescript
// Remove the entire optional tuple field
await db.User.updateUnique({
  where: { id: userId },
  data: {},
  unset: { backup: true },
});

// Equivalent to: data: { backup: NONE }
```

### Combining with data

You can update some elements while unsetting others:

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: { location: { lat: 42.0 } },
  unset: { location: { altitude: true } },
});
// Updates lat, clears altitude, preserves lng
```

TypeScript's `SafeUnset` utility type prevents conflicts — if a field appears in `data`, it's excluded from the `unset` type. See [`updateMany` — Unsetting Fields](../queries/update-many#unsetting-fields) for full details.

## Array Tuple: Push

Add one or more tuples to an array field:

```typescript
// Push a single tuple
await db.User.updateUnique({
  where: { id: userId },
  data: { history: { push: [5, 6] } },
});

// Push multiple tuples
await db.User.updateUnique({
  where: { id: userId },
  data: {
    history: {
      push: [
        [5, 6],
        [7, 8],
      ],
    },
  },
});
```

## Array Tuple: Set (Replace All)

Replace the entire array with a new set of tuples:

```typescript
// Replace with new array
await db.User.updateUnique({
  where: { id: userId },
  data: {
    history: {
      set: [
        [10, 20],
        [30, 40],
      ],
    },
  },
});

// Clear the array
await db.User.updateUnique({
  where: { id: userId },
  data: { history: { set: [] } },
});
```

## Array Tuple: Direct Assignment

You can also pass an array directly to replace the entire field:

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: {
    history: [
      [10, 20],
      [30, 40],
    ],
  },
});
```

**Note:** Array tuple fields do **not** support per-element update — only `push`, `set`, and direct assignment.

## Generated Update Type

For a model with tuple fields:

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  location Coordinate
  backup Coordinate?
  history Coordinate[]
}
```

The update type is:

```typescript
type CoordinateUpdate = {
  lat?: number;
  0?: number;
  lng?: number;
  1?: number;
};

type UserUpdate = {
  location?: [number, number] | CoordinateUpdate;
  backup?: [number, number] | CoordinateUpdate | typeof NONE; // NONE clears the field
  history?:
    | CoordinateInput[]
    | {
        push?: CoordinateInput | CoordinateInput[];
        set?: CoordinateInput[];
      };
};
```

Single tuple fields use `[arrayForm] | TupleUpdate` — the array form accepts only array syntax for full replacement, while the `TupleUpdate` object form enables per-element updates. Both named keys and index keys are accepted (when elements are named). Object elements use `Partial<ObjInput> | { set: ObjInput }` and nested tuple elements use `TupleArrayForm | TupleUpdate`.

Note that `CoordinateInput` accepts both array form (`[number, number]`) and object form (`{ lat: number; lng: number }`), but in the Update type only the array form is used for full replacement to avoid ambiguity with per-element update objects.
