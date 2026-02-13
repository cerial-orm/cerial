---
title: Updating Tuples
parent: Tuples
nav_order: 4
---

# Updating Tuples

Tuple updates are always **full replacements** — there is no partial merge like with objects. This is because tuples are positional data structures where every element has meaning.

## Single Tuple: Full Replace

```typescript
// Replace the entire tuple value
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

## Optional Tuple: Clear with null

For optional tuple fields, pass `null` to remove the value (sets to NONE in SurrealDB):

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: { backup: null },
});
```

After clearing, the field will be absent from the result (not `null`).

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

## Generated Update Type

For a model with tuple fields:

```cerial
model User {
  id Record @id
  location Coordinate
  backup Coordinate?
  history Coordinate[]
}
```

The update type is:

```typescript
type UserUpdate = {
  location?: CoordinateInput;
  backup?: CoordinateInput | null; // null clears to NONE
  history?:
    | CoordinateInput[]
    | {
        push?: CoordinateInput | CoordinateInput[];
        set?: CoordinateInput[];
      };
};
```

Note that `CoordinateInput` accepts both array form (`[number, number]`) and object form (`{ lat: number; lng: number }`).
