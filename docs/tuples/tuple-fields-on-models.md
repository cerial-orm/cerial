---
title: Tuple Fields on Models
parent: Tuples
nav_order: 2
---

# Tuple Fields on Models

Tuple types can be used as field types on models, just like primitives or objects. They support required, optional, and array variants.

## Required Tuple Field

```cerial
model User {
  id Record @id
  location Coordinate
}
```

- Must be provided on create
- TypeScript type: `Coordinate` (output) / `CoordinateInput` (input)
- SurrealDB type: `[float, float]`

## Optional Tuple Field

```cerial
model User {
  id Record @id
  backup Coordinate?
}
```

- Can be omitted on create (field is absent / NONE)
- On update, pass `null` to clear (sets to NONE)
- TypeScript output: `backup?: Coordinate` (no `| null` — absent means NONE)
- TypeScript input: `backup?: CoordinateInput`
- TypeScript update: `backup?: CoordinateInput | null`

```typescript
// Create without optional tuple
await db.User.create({ data: { name: 'Alice', location: [0, 0] } });

// Update to set optional tuple
await db.User.updateUnique({
  where: { id: userId },
  data: { backup: [10, 20] },
});

// Clear optional tuple (sets to NONE)
await db.User.updateUnique({
  where: { id: userId },
  data: { backup: null },
});
```

## Array Tuple Field

```cerial
model User {
  id Record @id
  history Coordinate[]
}
```

- Defaults to `[]` on create if not provided
- Supports `push` and `set` operations on update
- TypeScript type: `Coordinate[]` (output) / `CoordinateInput[]` (input)
- SurrealDB type: `array<[float, float]>`

```typescript
// Create with array of tuples
await db.User.create({
  data: {
    name: 'Alice',
    location: [0, 0],
    history: [
      [1, 2],
      [3, 4],
    ],
  },
});

// Push a single tuple
await db.User.updateUnique({
  where: { id: userId },
  data: { history: { push: [5, 6] } },
});

// Replace entire array
await db.User.updateUnique({
  where: { id: userId },
  data: { history: { set: [[10, 20]] } },
});

// Clear array
await db.User.updateUnique({
  where: { id: userId },
  data: { history: { set: [] } },
});
```

## Field-Level Decorators

Tuple fields on models support the same field-level decorators as other types:

| Decorator   | Effect                                       |
| ----------- | -------------------------------------------- |
| `@readonly` | Field can be set on create but not on update |

```cerial
model Sensor {
  id Record @id
  origin Coordinate @readonly
  current Coordinate
}
```

Note: `@default` and timestamp decorators are not supported on tuple fields themselves (only on primitive and date fields).

## Input Forms

All tuple fields accept both array form and object form (when elements are named):

```typescript
// Array form
await db.User.create({ data: { location: [40.7, -74.0] } });

// Object form (named keys)
await db.User.create({ data: { location: { lat: 40.7, lng: -74.0 } } });

// Index form
await db.User.create({ data: { location: { 0: 40.7, 1: -74.0 } } });

// Mixed form
await db.User.create({ data: { location: { lat: 40.7, 1: -74.0 } } });
```

Output is always array form:

```typescript
const user = await db.User.findOne({ where: { id: userId } });
console.log(user.location); // [40.7, -74.0]
```
