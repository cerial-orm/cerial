---
title: Relations
nav_order: 5
has_children: true
---

# Relations

Cerial provides a powerful relation system that maps SurrealDB record references to fully typed, queryable relationships between models. Relations are defined using `Relation` fields with `@field()` and `@model()` decorators in your `.cerial` schema files.

## How Relations Work

Every relation in Cerial has two conceptual sides:

- **Forward relation (PK side)**: The model that _stores_ the foreign key. It has a `Record` storage field paired with a `Relation` field using `@field(recordField)` and `@model(TargetModel)`.
- **Reverse relation (non-PK side)**: The model that is _referenced_ by the foreign key. It has a `Relation` field with only `@model(SourceModel)` — no `@field` decorator. These are resolved at query time by looking up the source table.

The forward relation owns the data. The reverse relation is a convenience for querying in the opposite direction and is **optional** to define.

## Relation Types

| Type         | PK Side                                       | Non-PK Side         |
| ------------ | --------------------------------------------- | ------------------- |
| One-to-One   | `Record` + `Relation @field`                  | `Relation @model`   |
| One-to-Many  | `Record` + `Relation @field`                  | `Relation[] @model` |
| Many-to-Many | `Record[]` + `Relation[] @field` (both sides) | Both sides are PK   |

## Side Capabilities

| Side        | Structure                       | Features                                                            |
| ----------- | ------------------------------- | ------------------------------------------------------------------- |
| PK Side     | `Record` + `Relation @field`    | Stores FK, full CRUD support (create, connect, disconnect, cascade) |
| Non-PK Side | `Relation @model` (no `@field`) | Reverse lookup only, optional to define                             |

## Anatomy of a Relation

```cerial
model Post {
  id Record @id
  title String
  authorId Record                                # FK storage field (the actual data in the DB)
  author Relation @field(authorId) @model(User)  # Forward relation (virtual, not stored)
}

model User {
  id Record @id
  name String
  posts Relation[] @model(Post)                  # Reverse relation (virtual, not stored)
}
```

In this example:

- `Post.authorId` is the **storage field** — a `Record` reference stored in SurrealDB as `record<user>`.
- `Post.author` is the **forward relation** — a virtual field that resolves `authorId` into a full `User` object when included.
- `User.posts` is the **reverse relation** — a virtual field that queries the `post` table for records where `authorId` matches the user's ID.

Only `authorId` is persisted to the database. Both `author` and `posts` are resolved at query time.

## Sections

- [One-to-One](one-to-one.md) — Single record on each side
- [One-to-Many](one-to-many.md) — One parent, many children
- [Many-to-Many](many-to-many.md) — Bidirectional arrays with atomic sync
- [Self-Referential](self-referential.md) — Models that reference themselves
- [Single-Sided Relations](single-sided.md) — Forward-only relations with no reverse
- [Multiple Relations](multi-relation.md) — Multiple relations between the same models using `@key`
- [Nested Create](nested-create.md) — Creating related records inline
- [Connect & Disconnect](connect-disconnect.md) — Linking and unlinking existing records
- [Delete Behavior](on-delete.md) — Cascade, SetNull, Restrict, and NoAction
