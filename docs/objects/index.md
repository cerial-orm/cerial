---
title: Objects
nav_order: 4
has_children: true
---

# Embedded Objects

Objects are inline data structures defined with the `object {}` keyword in Cerial schemas. Unlike models, objects are stored directly within the parent model — they do not create separate database tables.

## Key Rules

- Objects have **no `id` field**
- Objects have **no relations** (no `Relation` fields)
- Objects **can reference other objects** (nesting)
- Objects can have **optional fields** (`Type?`) and **array fields** (`Type[]`)
- Optional object fields on models produce `field?: ObjectType` (**not** `| null` like primitives)
- Array object fields on models default to `[]` on create if not provided
- Objects support a subset of [decorators](#supported-decorators) on their fields

## Supported Decorators

Object fields support a subset of decorators. Relation and identity decorators are not allowed.

| Decorator           | Allowed | Purpose                                       |
| ------------------- | ------- | --------------------------------------------- |
| `@default(value)`   | Yes     | Default value when field is omitted on create |
| `@now`              | Yes     | Auto-set to current timestamp on create       |
| `@unique`           | Yes     | Unique constraint per embedding path          |
| `@index`            | Yes     | Non-unique index per embedding path           |
| `@distinct`         | Yes     | Array deduplication                           |
| `@sort`             | Yes     | Array ordering                                |
| `@id`               | No      | Objects have no identity                      |
| `@field` / `@model` | No      | Objects have no relations                     |
| `@onDelete`         | No      | Objects have no relations                     |
| `@key`              | No      | Objects have no relations                     |

When an object with `@unique` or `@index` fields is used in multiple model fields, each embedding generates its own independent index. For example, if `LocationInfo` has `zip @unique` and is used in `User.location` and `User.altLocation`, two separate unique constraints are created: one for `location.zip` and one for `altLocation.zip`.

## Generated TypeScript Types

Each object definition generates the following TypeScript types:

| Generated Type          | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `ObjectName`            | Base interface with all fields                               |
| `ObjectNameInput`       | Input interface for creating/providing object data           |
| `ObjectNameCreateInput` | Input for create (only when object has `@default` or `@now`) |
| `ObjectNameWhere`       | Where clause type for filtering by object fields             |
| `ObjectNameSelect`      | Sub-field selection type for narrowing returned fields       |
| `ObjectNameOrderBy`     | Ordering type for sorting by object fields                   |

`ObjectNameCreateInput` is only generated when the object has fields with `@default` or `@now`. In that type, those fields become optional since the database fills them automatically. The parent model's `Create` type automatically uses `CreateInput` instead of `Input` for such objects.

Objects do **not** generate: `GetPayload`, `Include`, `Create`, `Update`, or `Model` types. These are exclusive to models.

## Example

```cerial
object ContactInfo {
  email Email
  phone String?
  city String @default("Unknown")
  createdAt Date @now
  tags String[] @distinct
}

object LocationInfo {
  address String
  zip String @unique
  country String @index
}

model User {
  id Record @id
  name String
  contact ContactInfo
  location LocationInfo
  altLocation LocationInfo?
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
