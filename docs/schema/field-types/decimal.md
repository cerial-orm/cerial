---
title: Decimal
parent: Field Types
grand_parent: Schema
nav_order: 11
---

# Decimal

An arbitrary-precision decimal number stored as SurrealDB's native `decimal` type. Output is a `CerialDecimal` instance; input accepts `CerialDecimalInput` (number, string, `CerialDecimal`, or SDK `Decimal`).

## Schema Syntax

```cerial
model Product {
  id Record @id
  price Decimal
  discount Decimal?
  tax Decimal @nullable
  amounts Decimal[]
}
```

## Types

| Direction | Type                                                                |
| --------- | ------------------------------------------------------------------- |
| Output    | `CerialDecimal`                                                     |
| Input     | `CerialDecimalInput` (number \| string \| CerialDecimal \| Decimal) |
| SurrealDB | `decimal`                                                           |

## CerialDecimal API

```typescript
import { CerialDecimal } from 'cerial';

// Create from number or string
const price = new CerialDecimal(99.99);
const precise = new CerialDecimal('123456789.123456789');

// Static constructors
CerialDecimal.from(input); // from CerialDecimalInput
CerialDecimal.parse(input); // alias for from()

// Arithmetic (immutable — returns new CerialDecimal)
price.add(other); // addition
price.sub(other); // subtraction
price.mul(other); // multiplication
price.div(other); // division

// Comparison
price.equals(other); // true if equal
price.compareTo(other); // negative/zero/positive
price.isZero(); // true if zero
price.isNegative(); // true if negative

// Conversion
price.toNumber(); // JavaScript number (lossy for large/precise values)
price.toString(); // string representation
price.toJSON(); // same as toString()
price.valueOf(); // number (for numeric coercion)

// SDK interop
price.toNative(); // SDK Decimal instance
price.clone(); // new CerialDecimal copy

// Type guard
CerialDecimal.is(value); // value is CerialDecimal
```

## Usage

```typescript
// Create with number
const product = await db.Product.create({
  data: { price: 29.99, tax: null },
});

// Create with string (preserves precision)
const product2 = await db.Product.create({
  data: { price: '99999999.99', tax: '7.5' },
});

// Create with CerialDecimal
const product3 = await db.Product.create({
  data: { price: CerialDecimal.from('49.99'), tax: null },
});

// Output is CerialDecimal
console.log(product.price); // CerialDecimal instance
console.log(product.price.toString()); // '29.99'
console.log(product.price.toNumber()); // 29.99
```

## Filtering

Decimal fields support comparison, set, and range operators:

```typescript
// Direct equality
const products = await db.Product.findMany({
  where: { price: 29.99 },
});

// Comparison operators
const expensive = await db.Product.findMany({
  where: { price: { gt: 100, lte: 500 } },
});

// Set operators
const specific = await db.Product.findMany({
  where: { price: { in: [9.99, 19.99, 29.99] } },
});

// Range
const midRange = await db.Product.findMany({
  where: { price: { between: [10, 100] } },
});
```

## Array Operations

```typescript
// Create with decimal array
const product = await db.Product.create({
  data: { price: 10, tax: null, amounts: [1.5, 2.5, 3.5] },
});

// Push to array
await db.Product.updateUnique({
  where: { id: product.id },
  data: { amounts: { push: 4.5 } },
});

// Full replace
await db.Product.updateUnique({
  where: { id: product.id },
  data: { amounts: [10, 20] },
});
```

## Decorators

Decimal fields support `@default` and `@defaultAlways`:

```cerial
model Config {
  id Record @id
  name String
  basePrice Decimal @default(99.99)
  resetPrice Decimal @defaultAlways(0)
}
```

`@default(99.99)` sets the value on create when the field is absent. `@defaultAlways(0)` resets the value on every create/update when absent.
