---
title: Schema
nav_order: 3
has_children: true
---

# Schema Definition Language

Cerial schemas are defined in `.cerial` files using a concise, Prisma-like syntax. Schemas describe your database structure and are used to generate a fully type-safe TypeScript client.

A schema consists of several building blocks:

- **Models** — Map to SurrealDB tables. Models have fields, decorators, and relations.
- **Objects** — Embedded types stored inline within models. Objects have fields but no decorators, no relations, and no `id`.
- **Enums** — Named sets of string constants. Generate a const object and a union type.
- **Tuples** — Fixed-length typed arrays with named or positional elements.
- **Literals** — Union types supporting any combination of values and structured types.

## Basic Format

```cerial
model ModelName {
  fieldName Type @decorator1 @decorator2
  fieldName Type?          # optional field
  fieldName Type[]         # array field
  fieldName ObjectName     # embedded object field
  fieldName EnumName       # enum field
}

object ObjectName {
  fieldName Type           # no decorators, no relations
}

enum EnumName { VALUE1, VALUE2, VALUE3 }
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

# Enum for user roles
enum Role { ADMIN, EDITOR, VIEWER }

# User model
model User {
  id Record @id
  email Email @unique
  name String
  role Role @default('VIEWER')
  bio String? @default(null)
  address Address?
  createdAt Date @createdAt
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
- [Enums](enums) — Named string constants with const object and union type
- [Enums vs Literals](enums-vs-literals) — When to use enums vs literals
- [Cross-File References](cross-file-references) — Splitting schemas across multiple files
