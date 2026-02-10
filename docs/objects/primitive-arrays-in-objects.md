---
title: Primitive Arrays in Objects
parent: Objects
nav_order: 3
---

# Primitive Arrays in Objects

Object types can contain primitive array fields. These are standard array types (`String[]`, `Int[]`, `Float[]`, etc.) defined inside an object definition.

## Schema Definition

```cerial
object OrderItem {
  productId String
  quantity Int
  tags String[]            # Array of strings inside the object
  scores Int[]             # Array of numbers inside the object
}

model Order {
  id Record @id
  items OrderItem[]
}
```

The `OrderItem` object contains two primitive array fields: `tags` (an array of strings) and `scores` (an array of integers). The `Order` model then holds an array of `OrderItem` objects.

## Creating Records

When creating records with primitive arrays inside objects, provide the arrays as standard TypeScript arrays:

```typescript
const order = await db.Order.create({
  data: {
    items: [
      {
        productId: 'prod-1',
        quantity: 2,
        tags: ['electronics', 'sale'],
        scores: [95, 88],
      },
      {
        productId: 'prod-2',
        quantity: 1,
        tags: ['books'],
        scores: [],
      },
    ],
  },
});
```

## Default Behavior

Array fields inside objects follow the same rules as array fields on models — they default to `[]` if not provided during creation:

```typescript
const order = await db.Order.create({
  data: {
    items: [
      {
        productId: 'prod-1',
        quantity: 2,
        // tags and scores omitted - default to []
      },
    ],
  },
});
// order.items[0].tags is []
// order.items[0].scores is []
```

## Supported Primitive Array Types

Any primitive type can be used as an array inside an object:

| Field Definition        | TypeScript Type      |
| ----------------------- | -------------------- |
| `tags String[]`         | `tags: string[]`     |
| `counts Int[]`          | `counts: number[]`   |
| `values Float[]`        | `values: number[]`   |
| `flags Bool[]`          | `flags: boolean[]`   |
| `timestamps Datetime[]` | `timestamps: Date[]` |
