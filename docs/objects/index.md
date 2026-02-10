---
title: Objects
nav_order: 4
has_children: true
---

# Embedded Objects

Objects are inline data structures defined with the `object {}` keyword in Cerial schemas. Unlike models, objects are stored directly within the parent model — they do not create separate database tables.

## Key Rules

- Objects have **no `id` field**
- Objects have **no decorators** (no `@id`, `@default`, `@unique`, etc.)
- Objects have **no relations** (no `Relation` fields)
- Objects **can reference other objects** (nesting)
- Objects can have **optional fields** (`Type?`) and **array fields** (`Type[]`)
- Optional object fields on models produce `field?: ObjectType` (**not** `| null` like primitives)
- Array object fields on models default to `[]` on create if not provided

## Generated TypeScript Types

Each object definition generates the following TypeScript types:

| Generated Type      | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `ObjectName`        | Base interface with all fields                         |
| `ObjectNameInput`   | Input interface for creating/providing object data     |
| `ObjectNameWhere`   | Where clause type for filtering by object fields       |
| `ObjectNameSelect`  | Sub-field selection type for narrowing returned fields |
| `ObjectNameOrderBy` | Ordering type for sorting by object fields             |

Objects do **not** generate: `GetPayload`, `Include`, `Create`, `Update`, or `Model` types. These are exclusive to models.

## Example

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

model User {
  id Record @id
  name String
  address Address
  shipping Address?
  locations GeoPoint[]
}
```

## Sections

- [Defining Objects](defining-objects) — Schema syntax for declaring object types
- [Object Fields on Models](object-fields-on-models) — Using objects as required, optional, or array fields on models
- [Primitive Arrays in Objects](primitive-arrays-in-objects) — Using primitive array fields inside object definitions
- [Select](select) — Sub-field selection and type-safe narrowing
- [Where Filtering](where) — Filtering queries by nested object fields
- [Updating Objects](update) — Partial merge vs full replacement updates
- [Ordering](orderby) — Sorting query results by nested object fields
