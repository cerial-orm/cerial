---
title: '@@index'
parent: Decorators
grand_parent: Schema
nav_order: 11
---

# @@index

Creates a non-unique composite index spanning multiple fields. This improves query performance for filters on the listed combination of fields, without enforcing uniqueness.

## Syntax

```cerial
model LogEntry {
  id Record @id
  userId String
  action String
  timestamp Date @createdAt

  @@index(userAction, [userId, action])
}
```

Composite directives are placed at the end of the model block:

```
@@index(name, [field1, field2, ...])
```

- **name** — A unique identifier for this composite. Must be globally unique across all models.
- **fields** — At least 2 field references. Supports dot notation for object subfields.

## Behavior

- A `DEFINE INDEX` statement (without `UNIQUE`) is generated in migrations for the listed fields.
- The index speeds up lookups but does **not** prevent duplicate combinations.
- `@@index` composites **cannot** be used with `findUnique`, `updateUnique`, `deleteUnique`, or `upsert` — those require `@@unique` or a single `@unique`/`@id` field.

## Difference from @@unique

| Aspect           | `@@index`                          | `@@unique`                                   |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| Duplicate combos | Allowed                            | Rejected by DB                               |
| Unique lookups   | Not available                      | `findUnique`, `updateUnique`, `deleteUnique` |
| Migration output | `DEFINE INDEX ... COLUMNS f1, f2;` | `DEFINE INDEX ... COLUMNS f1, f2 UNIQUE;`    |
| Use case         | Performance optimization           | Data integrity constraint                    |

## Object Subfields (Dot Notation)

Like `@@unique`, composite `@@index` supports dot notation for object subfields:

```cerial
object Address {
  city String
  state String
}

model Customer {
  id Record @id
  name String
  address Address

  @@index(cityState, [address.city, address.state])
}
```

## Null and Optional Fields

Since `@@index` does not enforce uniqueness, null/NONE values have no special behavior — multiple records with the same combination (including nulls) are always allowed.

For null behavior on unique constraints, see [@@unique — Null Behavior](composite-unique#null-behavior-on-optional-fields) and [@unique — Null Behavior](unique#null-behavior-on-optional-fields).

## Rules

- Requires **at least 2 fields**.
- Composite names must be **globally unique** across all models.
- **@id fields** cannot be part of a composite (they are already unique).
- **Relation fields** (virtual) cannot be indexed — use the underlying Record field instead.
- **Array fields** (`String[]`, `Record[]`) cannot be part of a composite.
- An **object field and its own subfield** cannot both appear in the same composite (e.g., `[address, address.city]` is rejected as redundant).
