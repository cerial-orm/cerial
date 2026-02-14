---
title: Updating Tuples
parent: Tuples
nav_order: 4
---

# Updating Tuples

Tuple fields support two update strategies: **full replacement** (replace the entire tuple) and **per-element update** (update individual elements without touching the rest).

## Full Replacement

Replace the entire tuple value at once:

```typescript
// Array form
await db.User.updateUnique({
  where: { id: userId },
  data: { location: [99.0, 88.0] },
});

// Object form also works
await db.User.updateUnique({
  where: { id: userId },
  data: { location: { lat: 99.0, lng: 88.0 } },
});
```

## Per-Element Update

Use the `{ update: ... }` wrapper to update individual elements without replacing the entire tuple. Elements you don't specify remain unchanged:

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
  data: { location: { update: { lat: 99.0 } } },
});

// Update by index key
await db.User.updateUnique({
  where: { id: userId },
  data: { location: { update: { 0: 99.0 } } },
});
```

The `{ update: ... }` wrapper is required to distinguish per-element update from the object form of full replacement. Without it, `{ lat: 99.0, lng: 88.0 }` is treated as a full replace.

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
  data: { place: { update: { 1: { city: 'NYC' } } } },
});

// Full replace the object element with { set: ... }
await db.Place.updateUnique({
  where: { id: placeId },
  data: { place: { update: { 1: { set: { street: '5th Ave', city: 'NYC' } } } } },
});
```

### Nested Tuple Elements: Recursive Per-Element Update

When a tuple contains another tuple, you can nest `{ update: ... }` wrappers to update elements at any depth:

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
await db.Model.updateUnique({
  where: { id: recordId },
  data: { data: { update: { 1: { update: { x: 42 } } } } },
});

// Or full-replace just the inner tuple element
await db.Model.updateUnique({
  where: { id: recordId },
  data: { data: { update: { 1: [42, 99] } } },
});
```

### Optional Elements: NONE

For tuples with optional elements, pass `NONE` to clear an element (set it to absent):

```typescript
import { NONE } from './db-client';

await db.Model.updateUnique({
  where: { id: recordId },
  data: { tuple: { update: { 1: NONE } } },
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
  location?: CoordinateInput | { update: CoordinateUpdate };
  backup?: CoordinateInput | { update: CoordinateUpdate } | typeof NONE; // NONE clears the field
  history?:
    | CoordinateInput[]
    | {
        push?: CoordinateInput | CoordinateInput[];
        set?: CoordinateInput[];
      };
};
```

The `TupleUpdate` type includes both named keys and index keys (when elements are named). Object elements use `Partial<ObjInput> | { set: ObjInput }` and nested tuple elements use `TupleInput | { update: TupleUpdate }`.

Note that `CoordinateInput` accepts both array form (`[number, number]`) and object form (`{ lat: number; lng: number }`).
