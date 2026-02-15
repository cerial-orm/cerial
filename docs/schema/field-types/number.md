---
title: Number
parent: Field Types
grand_parent: Schema
nav_order: 4
---

# Number Field Type

The `Number` field type represents a numeric value that can be either an integer or a decimal. SurrealDB's `number` type auto-detects the internal representation based on the value provided.

## Syntax

```cerial
model Product {
  price Number
  rating Number?
  score Number @default(0)
}
```

## TypeScript Type

Number fields map to the TypeScript `number` type:

```typescript
type Product = {
  price: number;
  rating?: number;
  score: number;
};
```

## Behavior

- **Accepts both integers and decimals**: `42`, `3.14`, `0.5`
- **SurrealDB decides representation**: SurrealDB internally stores the value as either an integer or float based on the input
- **Ordered**: Number fields support comparison operators (`gt`, `gte`, `lt`, `lte`, `between`)
- **Arithmetic-ready**: Use in calculations and comparisons

## Int vs Float vs Number

| Type       | Range           | Decimals          | Use Case                               |
| ---------- | --------------- | ----------------- | -------------------------------------- |
| **Int**    | -2^63 to 2^63-1 | No (truncates)    | Whole numbers, counts, IDs             |
| **Float**  | IEEE 754 double | Yes (explicit)    | Precise decimals, scientific data      |
| **Number** | Both            | Yes (auto-detect) | General numeric values, flexible input |

### When to Use Number

- **Flexible input**: Accept both `42` and `42.5` without type conversion
- **User-provided values**: Let SurrealDB optimize storage automatically
- **Mixed numeric data**: Fields that may contain integers or decimals

### When to Use Int

- **Whole numbers only**: Counts, IDs, quantities
- **Explicit truncation**: Ensure no decimals are stored

### When to Use Float

- **Explicit decimal precision**: Scientific calculations, measurements
- **Consistent storage**: Always store as IEEE 754 double

## Examples

### Basic Usage

```cerial
model Product {
  id Record @id
  name String
  price Number
  rating Number?
}
```

```typescript
const product = await client.db.Product.create({
  data: {
    name: 'Widget',
    price: 19.99,
    rating: 4.5,
  },
});

console.log(product.price); // 19.99
console.log(product.rating); // 4.5
```

### With Defaults

```cerial
model Review {
  id Record @id
  text String
  score Number @default(5)
}
```

```typescript
const review = await client.db.Review.create({
  data: { text: 'Great product!' },
});

console.log(review.score); // 5 (default)
```

### Filtering

```typescript
const expensive = await client.db.Product.findMany({
  where: { price: { gte: 50 } },
});

const inRange = await client.db.Product.findMany({
  where: { price: { between: [10, 100] } },
});
```

### In Objects and Tuples

```cerial
model Measurement {
  id Record @id
  name String
  stats Stats
  coordinates Coordinate
}

object Stats {
  min Number
  max Number
  average Number
}

tuple Coordinate {
  x Number
  y Number
  z Number?
}
```

```typescript
const measurement = await client.db.Measurement.create({
  data: {
    name: 'Lab Test',
    stats: { min: 10.5, max: 99.9, average: 55.2 },
    coordinates: [1.5, 2.5, 3.5],
  },
});

console.log(measurement.stats.average); // 55.2
console.log(measurement.coordinates[0]); // 1.5
```

## Operators

Number fields support all numeric comparison operators:

- **Comparison**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- **Range**: `between`
- **Set**: `in`, `notIn`
- **Special**: `isNull`, `isNone` (for optional/nullable fields)

```typescript
await client.db.Product.findMany({
  where: {
    price: {
      gte: 10,
      lte: 100,
    },
  },
});
```

## Decorators

Number fields support:

- `@default(value)` — Set a default value
- `@defaultAlways(value)` — Reset to value on every write
- `@createdAt` / `@updatedAt` — Timestamp (Date fields only, not Number)
- `@nullable` — Allow explicit `null` values
- `@readonly` — Write-once field
- `@index` / `@unique` — Indexing

```cerial
model Product {
  id Record @id
  price Number @default(0)
  weight Number @nullable
  score Number @readonly
}
```
