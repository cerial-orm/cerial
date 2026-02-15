---
title: Defining Tuples
parent: Tuples
nav_order: 1
---

# Defining Tuples

Tuples are declared using the `tuple` keyword with comma-separated elements inside curly braces.

## Basic Syntax

```cerial
tuple TupleName {
  element1Type,
  element2Type,
  ...
}
```

Elements can be **named** or **unnamed**:

```cerial
tuple Coordinate {
  lat Float,     # named element
  lng Float      # named element
}

tuple Pair {
  Int,           # unnamed element (index 0)
  Int            # unnamed element (index 1)
}

tuple Entry {
  name String,   # named
  Int,           # unnamed (index 1)
  Bool           # unnamed (index 2)
}
```

Named elements provide convenience for input — users can pass `{ lat: 1.5, lng: 2.5 }` instead of `[1.5, 2.5]`. The output is always an array regardless of element names.

## Nullable Elements

Individual elements can be nullable using `@nullable`:

```cerial
tuple WithOptional {
  label String,
  Float @nullable   # this element can be null
}
```

Nullable elements produce `type | null` in SurrealDB and `type | null` at the corresponding array position.

{: .warning }

> The `?` modifier is **not allowed** on tuple elements. Use `@nullable` instead. SurrealDB returns `null` (not `undefined`) for absent tuple positions, so `?` would be semantically incorrect. The validator will reject `?` on tuple elements with a clear error.

## Nested Tuples

Tuples can reference other tuples as element types:

```cerial
tuple Inner {
  x Int,
  y Int
}

tuple Outer {
  label String,
  Inner           # nested tuple element
}
```

The nested tuple follows the same input/output rules — array form in output, array or object form in input.

```typescript
// Input
await db.Model.create({
  data: { point: ['hello', [1, 2]] },
});
// Or with object form for the inner tuple
await db.Model.create({
  data: { point: ['hello', { x: 1, y: 2 }] },
});

// Output
console.log(result.point); // ['hello', [1, 2]]
```

## Objects in Tuples

Tuples can contain object-type elements:

```cerial
object Address {
  street String
  city String
}

tuple Located {
  tag String,
  Address         # object element
}
```

```typescript
await db.Model.create({
  data: { place: ['work', { street: 'Main St', city: 'NYC' }] },
});
// Output: ['work', { street: 'Main St', city: 'NYC' }]
```

## Tuples in Objects

Objects can have tuple-typed fields:

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

object LocationInfo {
  label String
  coord Coordinate
}
```

The object's input type uses `CoordinateInput` (accepts both array and object form), while the output type uses `Coordinate` (array form).

## Self-Referencing Tuples

A tuple can reference itself, but the self-referencing element **must be nullable** to avoid infinite recursion:

```cerial
tuple TreeNode {
  value Int,
  TreeNode @nullable   # nullable self-reference
}
```

Non-nullable self-references are a parse error.

## Reusing Tuples

The same tuple can be used across multiple models and fields:

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  home Coordinate
  work Coordinate?
}

model Store {
  id Record @id
  location Coordinate
}
```

Each usage generates the same underlying SurrealDB type definition (`[float, float]`).
