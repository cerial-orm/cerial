---
title: Schema
nav_order: 3
has_children: true
---

# Schema Definition Language

Cerial schemas are defined in `.cerial` files using a concise, Prisma-like syntax. Schemas describe your database structure and are used to generate a fully type-safe TypeScript client.

A schema consists of two building blocks:

- **Models** — Map to SurrealDB tables. Models have fields, decorators, and relations.
- **Objects** — Embedded types stored inline within models. Objects have fields but no decorators, no relations, and no `id`.

## Basic Format

```cerial
model ModelName {
  fieldName Type @decorator1 @decorator2
  fieldName Type?          # optional field
  fieldName Type[]         # array field
  fieldName ObjectName     # embedded object field
}

object ObjectName {
  fieldName Type           # no decorators, no relations
}
```

## Syntax Rules

- **Field name** comes first, written in `camelCase` (e.g. `firstName`, `createdAt`)
- **Type** follows the field name, written in `UpperFirst` (e.g. `String`, `Int`, `Record`)
- **Optional** fields are marked with `?` after the type (e.g. `String?`)
- **Array** fields are marked with `[]` after the type (e.g. `String[]`)
- **Decorators** follow the type and are prefixed with `@` (e.g. `@unique`, `@default("pending")`)
- **Comments** start with `#` and are ignored by the parser

## Example Schema

```cerial
# Shared embedded types
object Address {
  street String
  city String
  state String
  zipCode String?
}

# User model
model User {
  id Record @id
  email Email @unique
  name String
  bio String? @default(null)
  address Address?
  createdAt Date @now
}

# Post model with relation to User
model Post {
  id Record @id
  title String
  content String
  tags String[] @distinct @sort
  authorId Record
  author Relation @field(authorId) @model(User)
}
```

## Learn More

- [Field Types](field-types) — All available field types (`String`, `Int`, `Record`, `Relation`, etc.)
- [Array Types](array-types) — Array field syntax and behavior
- [Optional Fields](optional-fields) — Optional field semantics and NONE vs null
- [Decorators](decorators/) — All decorators (`@id`, `@unique`, `@default`, `@field`, `@model`, etc.)
- [Comments](comments) — Comment syntax
- [Cross-File References](cross-file-references) — Splitting schemas across multiple files
