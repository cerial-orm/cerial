---
title: Replace Array
parent: Array Operations
nav_order: 2
---

# Replace Array

Instead of modifying individual elements with `push` or `unset`, you can replace the entire contents of an array field by passing a plain array value.

## Full Replacement

Pass an array directly (without wrapping it in an operator object) to replace the entire array:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: ['New', 'Array', 'Values'] },
});
```

The previous contents of `nicknames` are completely discarded and replaced with the new array.

## Set Array to Empty

Replace an array with an empty array to clear all elements:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: [] },
});
```

## Replace Number Arrays

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { scores: [100, 95, 88] },
});
```

## Replace Date Arrays

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    loginDates: [new Date('2025-01-01'), new Date('2025-06-15')],
  },
});
```

## Replace with updateUnique

Full replacement works the same way with `updateUnique`:

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: { scores: [100, 98, 97] },
});
```

## Replacement vs Operators

It is important to understand the difference between full replacement and the `push`/`unset` operators:

| Syntax               | Behavior                                    |
| -------------------- | ------------------------------------------- |
| `{ push: 'value' }`  | Adds `'value'` to the existing array        |
| `{ unset: 'value' }` | Removes `'value'` from the existing array   |
| `['a', 'b']`         | Replaces the entire array with `['a', 'b']` |

### Example Comparison

Given a user with `nicknames: ['Alice', 'Bob']`:

```typescript
// Push: nicknames becomes ['Alice', 'Bob', 'Charlie']
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { push: 'Charlie' } },
});

// Unset: nicknames becomes ['Alice']
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { unset: 'Bob' } },
});

// Replace: nicknames becomes ['Dave', 'Eve']
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: ['Dave', 'Eve'] },
});
```

## Combining with Other Fields

You can mix full replacement on one field with operators on another:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    nicknames: ['CompletelyNew'], // Full replacement
    scores: { push: 100 }, // Push to existing
    ratings: { unset: 1.0 }, // Remove from existing
  },
});
```

## Notes

- Full replacement is useful when you know the complete desired state of the array.
- Use `push`/`unset` when you want to modify the array relative to its current contents.
- Passing an empty array `[]` is the idiomatic way to clear an array field.
- Type safety is enforced: the array elements must match the declared field type.
