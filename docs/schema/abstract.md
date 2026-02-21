---
title: Abstract Models
parent: Schema
nav_order: 12
---

# Abstract Models

Abstract models define reusable field sets that other models can [extend](extends). They exist only at schema resolution time. No table, no TypeScript types, no client accessor, and no registry entry are generated for them.

## Syntax

```cerial
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}
```

The `abstract` keyword goes before `model`. Everything inside the body follows normal field syntax, including decorators, optionals, and arrays.

## What Abstract Prevents

An abstract model produces nothing in the generated output:

| Generated artifact | Abstract | Concrete |
| --- | --- | --- |
| SurrealDB table | No | Yes |
| TypeScript interface | No | Yes |
| Client accessor (`db.Model`) | No | Yes |
| Model registry entry | No | Yes |
| Migration `DEFINE TABLE` | No | Yes |

Abstract models are consumed during inheritance resolution, then discarded. Concrete children that extend them get their own tables and types with the inherited fields flattened in.

## Basic Usage

Define common fields once and share them across models:

```cerial
abstract model Timestamped {
  id Record @id
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}

model User extends Timestamped {
  email Email @unique
  name String
}

model Post extends Timestamped {
  title String
  content String?
}
```

Both `User` and `Post` get `id`, `createdAt`, and `updatedAt` from `Timestamped`. Each model has its own independent table and generated types.

```typescript
// User has all five fields
const user = await client.db.User.create({
  data: { email: 'alice@test.com', name: 'Alice' },
});
user.id;        // CerialId<string>
user.createdAt; // Date
user.updatedAt; // Date

// Post has its own four fields
const post = await client.db.Post.create({
  data: { title: 'Hello World' },
});
```

There is no `client.db.Timestamped`. The abstract model doesn't exist at runtime.

## Layered Abstracts

Abstract models can extend other abstract models, building up shared field sets incrementally:

```cerial
abstract model L1Base {
  id Record @id
  createdAt Date @createdAt
}

abstract model L2Named extends L1Base {
  name String
  description String?
}

abstract model L3Tagged extends L2Named {
  tags String[]
  metadata Int?
}

model Article extends L3Tagged {
  status String @default('draft')
}
```

`Article` gets the full chain: `id`, `createdAt`, `name`, `description`, `tags`, `metadata`, `status`.

## Rules

### What Can Extend What

| Parent | Child | Allowed? |
| --- | --- | --- |
| abstract | abstract | Yes |
| abstract | concrete | Yes |
| concrete | concrete | **No** |
| concrete | abstract | **No** |

All models (both concrete and abstract) can only extend abstract models. A model cannot extend a concrete model. This ensures a clean separation: abstract models serve as reusable templates, and concrete models are always leaf types with their own tables. To share fields between concrete models, extract the common fields into an abstract intermediary.

### Only Models Can Be Abstract

The `abstract` keyword applies to models only. Objects, tuples, enums, and literals cannot be declared abstract. They don't generate tables anyway, so there's no table to suppress. Any type kind can be used as a parent in `extends` without needing `abstract`.

### Private Fields on Abstracts

Abstract models commonly use [`!!private`](modifiers/private) on fields like `id` and `createdAt` to prevent children from accidentally redefining them:

```cerial
abstract model BaseEntity {
  id Record @id !!private
  createdAt Date @createdAt !!private
  updatedAt Date @updatedAt
}
```

Children still inherit `id` and `createdAt` normally. They just can't override them.

## Practical Patterns

### Shared Timestamps

The most common use case. Define `id` and timestamp fields once:

```cerial
abstract model BaseEntity {
  id Record @id !!private
  createdAt Date @createdAt !!private
  updatedAt Date @updatedAt
}

model User extends BaseEntity {
  email Email @unique
  name String
}

model Comment extends BaseEntity {
  content String
  authorId Record
  author Relation @field(authorId) @model(User)
}
```

### Role Hierarchy

Build specialized models from a common user shape:

```cerial
abstract model BaseUser extends BaseEntity {
  email Email @unique
  name String
  isActive Bool @default(true)
}

model RegularUser extends BaseUser {
  preferences String?
}

model Admin extends BaseUser[!isActive] {
  level Int @default(1)
  permissions String[]
}
```

`Admin` omits `isActive` since admins are always active by definition. `RegularUser` inherits the full set.
