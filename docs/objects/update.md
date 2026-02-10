---
title: Updating Objects
parent: Objects
nav_order: 6
---

# Updating Embedded Object Fields

Cerial supports two modes for updating embedded object fields: **partial merge** and **full replacement**.

## Partial Update (Merge)

By default, passing an object in the `data` field performs a partial merge. Only the specified fields are changed; all other fields on the object are preserved:

```typescript
await db.User.updateMany({
  where: { id: user.id },
  data: { address: { city: 'New City' } },
});
// Only `city` is changed
// `street`, `state`, and `zipCode` remain unchanged
```

This is useful when you want to modify one or two fields without needing to re-specify the entire object.

### Multiple Fields in a Partial Update

```typescript
await db.User.updateMany({
  where: { id: user.id },
  data: {
    address: {
      city: 'Boston',
      state: 'MA',
    },
  },
});
// `city` and `state` are updated
// `street` and `zipCode` are preserved
```

## Full Replacement with `set`

To replace the entire object, use the `{ set: ... }` wrapper. This discards the existing object and stores the new one in its place:

```typescript
await db.User.updateMany({
  where: { id: user.id },
  data: {
    address: {
      set: { street: '1 Main St', city: 'NYC', state: 'NY' },
    },
  },
});
// Entire address object is replaced
// Any fields not included in `set` become NONE
```

{: .important }

> The difference between merge and `set` matters. Partial merge keeps fields you don't mention. `set` replaces the whole object — any fields not provided in the `set` value become NONE (absent).

## Comparison

| Operation      | Unmentioned Fields | Use Case                  |
| -------------- | ------------------ | ------------------------- |
| Partial merge  | Preserved          | Update a few fields       |
| `{ set: ... }` | Become NONE        | Replace the entire object |

### Example Showing the Difference

Given an existing address `{ street: '123 Main', city: 'NYC', state: 'NY', zipCode: '10001' }`:

```typescript
// Partial merge — zipCode stays '10001'
await db.User.updateMany({
  where: { id: user.id },
  data: { address: { city: 'Boston', state: 'MA' } },
});
// Result: { street: '123 Main', city: 'Boston', state: 'MA', zipCode: '10001' }

// Full replacement — zipCode becomes NONE
await db.User.updateMany({
  where: { id: user.id },
  data: { address: { set: { street: '456 Elm', city: 'Boston', state: 'MA' } } },
});
// Result: { street: '456 Elm', city: 'Boston', state: 'MA' }
// zipCode is absent (NONE)
```

## Removing an Optional Object

For optional object fields, you can remove the object entirely by setting it to `undefined`:

```typescript
await db.User.updateMany({
  where: { id: user.id },
  data: { shipping: undefined }, // Remove shipping (NONE)
});
// user.shipping is now undefined (field absent in SurrealDB)
```
