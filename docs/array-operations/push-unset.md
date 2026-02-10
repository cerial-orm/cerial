---
title: Push & Unset
parent: Array Operations
nav_order: 1
---

# Push & Unset

Cerial provides `push` and `unset` operators for modifying array fields without replacing the entire array. These operators are available in both `updateMany` and `updateUnique`.

## Push

The `push` operator adds one or more elements to an existing array.

### Push a Single Element

Pass a single value to append it to the array:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { push: 'NewNick' } },
});
```

### Push Multiple Elements

Pass an array to append multiple values at once:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { push: ['Nick1', 'Nick2'] } },
});
```

### Push to Number Arrays

Works the same way with `Int[]` and `Float[]` fields:

```typescript
// Push to Int array
await db.User.updateMany({
  where: { id: userId },
  data: { scores: { push: 100 } },
});

// Push multiple floats
await db.User.updateMany({
  where: { id: userId },
  data: { ratings: { push: [4.5, 3.8] } },
});
```

### Push to Date Arrays

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { loginDates: { push: new Date() } },
});

// Push multiple dates
await db.User.updateMany({
  where: { id: userId },
  data: { loginDates: { push: [new Date('2025-01-01'), new Date('2025-06-15')] } },
});
```

## Unset

The `unset` operator removes one or more elements from an existing array. All occurrences of the specified value(s) are removed.

### Remove a Single Element

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { scores: { unset: 100 } },
});
```

### Remove Multiple Elements

Pass an array to remove multiple values in one operation:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { scores: { unset: [100, 95] } },
});
```

### Remove from String Arrays

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { unset: 'OldNick' } },
});

// Remove multiple strings
await db.User.updateMany({
  where: { id: userId },
  data: { nicknames: { unset: ['OldNick', 'TempName'] } },
});
```

## Combining Push and Unset

You can use `push` and `unset` on different array fields in the same update call:

```typescript
await db.User.updateMany({
  where: { id: userId },
  data: {
    nicknames: { push: 'NewName' },
    scores: { unset: 50 },
  },
});
```

This atomically adds `'NewName'` to the `nicknames` array and removes `50` from the `scores` array in a single operation.

## Using with updateUnique

Both operators work identically with `updateUnique`:

```typescript
await db.User.updateUnique({
  where: { id: userId },
  data: { nicknames: { push: 'AnotherNick' } },
});

await db.User.updateUnique({
  where: { id: userId },
  data: { scores: { unset: 42 } },
});
```

## Notes

- `push` appends elements to the end of the array (unless the field has a `@sort` decorator, in which case SurrealDB maintains sort order).
- `unset` removes **all** occurrences of the specified value(s) from the array.
- If the value passed to `unset` does not exist in the array, the operation is a no-op for that value.
- These operators are type-safe: TypeScript enforces that the pushed/unset values match the array element type.
