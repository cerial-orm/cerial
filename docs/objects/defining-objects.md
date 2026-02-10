---
title: Defining Objects
parent: Objects
nav_order: 1
---

# Defining Objects

Object types are defined in `.cerial` schema files using the `object {}` keyword. They describe inline data structures that are embedded directly within models.

## Basic Syntax

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}
```

Each field in an object follows the same `name Type` syntax as model fields. Fields can be:

- **Required primitives** — `street String`
- **Optional primitives** — `zipCode String?` (the `?` suffix makes the field optional)
- **Arrays** — `tags String[]` (array of primitives or objects)
- **Other object types** — `label Address?` (references another object)

## Nested Objects

Objects can reference other object types, allowing arbitrarily deep nesting:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

object GeoPoint {
  lat Float
  lng Float
  label Address?     # References another object type
}
```

Here `GeoPoint` has an optional `label` field that holds a full `Address` object. When a `GeoPoint` is stored, the `label` is embedded inline within it.

## Self-Referencing Objects

Objects can reference themselves, enabling recursive/tree structures:

```cerial
object TreeNode {
  value Int
  children TreeNode[]
}
```

This defines a tree node where each node holds an array of child nodes of the same type.

## Primitive Arrays Inside Objects

Object fields can be arrays of primitive types:

```cerial
object OrderItem {
  productId String
  quantity Int
  tags String[]      # Array of strings inside the object
  scores Int[]       # Array of integers inside the object
}
```

Array fields inside objects follow the same rules as array fields on models — they default to `[]` if not provided during creation.

## Combined Example

The following schema demonstrates all object features together:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

object GeoPoint {
  lat Float
  lng Float
  label Address?
}

object OrderItem {
  productId String
  quantity Int
  tags String[]
  deliveryAddress Address
}

object TreeNode {
  value Int
  children TreeNode[]
}
```

This defines four object types:

- `Address` — a simple flat object with an optional field
- `GeoPoint` — nests an optional `Address` object
- `OrderItem` — contains primitive arrays and a required nested `Address`
- `TreeNode` — a self-referencing recursive structure
