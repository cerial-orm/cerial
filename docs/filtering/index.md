---
title: Filtering
nav_order: 7
has_children: true
---

# Filtering

Cerial provides a rich set of filter operators for querying your data. Filters are used in `where` clauses across all query methods:

- `findOne`
- `findMany`
- `findUnique`
- `updateMany`
- `updateUnique`
- `deleteMany`
- `deleteUnique`
- `count`
- `exists`

## Operator Categories

| Category                                        | Operators                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| [Comparison](./comparison)                      | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`                                  |
| [String](./string-operators)                    | `contains`, `startsWith`, `endsWith`                                   |
| [Array](./array-operators)                      | `has`, `hasAll`, `hasAny`, `isEmpty`, `in`, `notIn`                    |
| [Logical](./logical-operators)                  | `AND`, `OR`, `NOT`                                                     |
| [Special](./special-operators)                  | `isNull`, `between`, `isNone`                                          |
| [Nested Relations](./nested-relation-filtering) | Relation field filtering                                               |
| [Object](./object-filtering)                    | Embedded object field filtering, quantifiers (`some`, `every`, `none`) |
| [Literal](../schema/literals#filtering)         | Filtering on union-typed literal fields                                |

## Basic Syntax

Filters follow a consistent pattern. The simplest form is a shorthand equals check, and more complex conditions use operator objects.

### Shorthand Equals

Pass a value directly to match equality:

```typescript
const user = await db.User.findOne({
  where: { name: 'John' },
});
```

### Operator Syntax

Use an operator object for more advanced comparisons:

```typescript
const users = await db.User.findMany({
  where: { age: { gt: 18 } },
});
```

### Multiple Conditions (Implicit AND)

When you specify multiple fields at the top level, they are combined with an implicit AND:

```typescript
const users = await db.User.findMany({
  where: {
    name: 'John',
    age: { gte: 18 },
    isActive: true,
  },
});
// Matches users where name = 'John' AND age >= 18 AND isActive = true
```

### Combining Operators on a Single Field

You can apply multiple operators to the same field within one object:

```typescript
const users = await db.User.findMany({
  where: {
    age: { gte: 18, lt: 65 },
  },
});
// Matches users where age >= 18 AND age < 65
```

## Type Safety

All filter operators are fully typed based on your schema. The `where` clause only accepts fields defined on the model, and operator values must match the field's type. For example, you cannot use `{ age: { contains: 'text' } }` because `contains` is a string operator and `age` is a number field. For [literal fields](../schema/literals#filtering), the available operators are derived from the union's constituent types — comparison operators for numeric variants, string operators only when all variants are string-compatible.

```typescript
// Type error: 'contains' does not exist on number fields
await db.User.findMany({
  where: { age: { contains: '18' } }, // TS error
});

// Correct: use comparison operators for numbers
await db.User.findMany({
  where: { age: { gte: 18 } },
});
```
