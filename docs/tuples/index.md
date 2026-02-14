---
title: Tuples
nav_order: 4.5
has_children: true
---

# Tuples

Tuples are fixed-length, typed arrays defined with the `tuple {}` keyword in Cerial schemas. Each element has a specific type and position. Unlike objects, tuple output is always an array — elements are accessed by index.

## Key Rules

- Tuples have **no `id` field** and **no relations**
- Elements are comma-separated inside `{ }`
- Elements can be **named** (`lat Float`) or **unnamed** (`Float`) — names are for input convenience only
- **Output is always an array** — `[1.5, 2.5]`, not `{ lat: 1.5, lng: 2.5 }`
- **Input accepts both forms** — array `[1.5, 2.5]` or object `{ lat: 1.5, lng: 2.5 }`
- Optional elements are supported (`Float?`)
- **No decorators** on tuple elements
- Tuples can reference other tuples and objects as element types
- **Per-element update** — update individual elements with `{ update: { lat: 5 } }` without replacing the whole tuple
- **Sub-field select** — narrow object sub-fields within tuples (only for tuples with object elements)
- **No OrderBy** on tuple fields

## Generated TypeScript Types

Each tuple definition generates the following TypeScript types:

| Generated Type     | Purpose                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `Coordinate`       | Output type — a TypeScript tuple `[number, number]`                                         |
| `CoordinateInput`  | Input type — accepts array form or object form with named/index keys                        |
| `CoordinateWhere`  | Where clause type for filtering by element values                                           |
| `CoordinateUpdate` | Per-element update type — update individual elements without full replacement               |
| `CoordinateSelect` | Sub-field select type — only generated when the tuple contains object elements at any depth |

Tuples do **not** generate: `OrderBy`, `Create`, `Include`, or `GetPayload` types. They are operated on through their parent model.

## Example

```cerial
tuple Coordinate {
  lat Float,
  lng Float
}

model User {
  id Record @id
  name String
  location Coordinate
  backup Coordinate?
  history Coordinate[]
}
```

```typescript
// Create with array form
await db.User.create({
  data: { name: 'Alice', location: [40.7, -74.0] },
});

// Create with object form (named keys)
await db.User.create({
  data: { name: 'Bob', location: { lat: 51.5, lng: -0.1 } },
});

// Output is always array form
const user = await db.User.findOne({ where: { name: 'Alice' } });
console.log(user.location); // [40.7, -74.0]
console.log(user.location[0]); // 40.7  (lat)
console.log(user.location[1]); // -74.0 (lng)
```

## Sections

- [Defining Tuples](defining-tuples) — Schema syntax for declaring tuple types
- [Tuple Fields on Models](tuple-fields-on-models) — Using tuples as required, optional, or array fields on models
- [Where Filtering](where) — Filtering queries by tuple element values
- [Updating Tuples](update) — Full replacement, per-element update, array push/set, and clearing
- [Select](select) — Sub-field selection for tuples with object elements
