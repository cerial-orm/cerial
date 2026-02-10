---
title: '@key'
parent: Decorators
grand_parent: Schema
nav_order: 7
---

# @key

Disambiguates relations when multiple relations exist between the same two models, or when a model has a self-referential relation with a reverse lookup. Both the forward and reverse relations must share the same `@key` value to pair them correctly.

## Syntax

```cerial
@key(name)
```

The `name` is an arbitrary string identifier. Matching forward and reverse relations must use the same key name.

## When Is @key Required?

`@key` is required in two situations:

1. **Multiple relations between the same two models** — Cerial cannot automatically determine which forward relation pairs with which reverse relation.
2. **Self-referential relations with a reverse lookup** — A model that relates to itself needs `@key` to distinguish the forward and reverse directions.

If there is only one relation between two models, `@key` is not needed — Cerial resolves it automatically.

## Multiple Relations to the Same Model

When a model has two or more relations pointing to the same target model, each pair needs a unique `@key`:

```cerial
model Document {
  id Record @id
  title String

  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)

  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer)
}

model Writer {
  id Record @id
  name String

  authoredDocs Relation[] @model(Document) @key(author)
  reviewedDocs Relation[] @model(Document) @key(reviewer)
}
```

Without `@key`, Cerial wouldn't know whether `authoredDocs` corresponds to the `author` relation or the `reviewer` relation.

```typescript
const writer = await db.Writer.findOne({
  where: { id: writerId },
  include: {
    authoredDocs: true, // Documents where this writer is the author
    reviewedDocs: true, // Documents where this writer is the reviewer
  },
});
```

## Self-Referential Relations

A model that references itself needs `@key` to pair the forward and reverse relations:

```cerial
model Category {
  id Record @id
  name String
  parentId Record?
  parent Relation? @field(parentId) @model(Category) @key(hierarchy)
  children Relation[] @model(Category) @key(hierarchy)
}
```

```typescript
// Get a category with its parent and children
const category = await db.Category.findOne({
  where: { id: categoryId },
  include: {
    parent: true,
    children: true,
  },
});
```

## Multiple Self-Referential Relations

If a model has multiple self-referential relation pairs, each pair gets its own key:

```cerial
model Employee {
  id Record @id
  name String

  managerId Record?
  manager Relation? @field(managerId) @model(Employee) @key(management)
  directReports Relation[] @model(Employee) @key(management)

  mentorId Record?
  mentor Relation? @field(mentorId) @model(Employee) @key(mentorship)
  mentees Relation[] @model(Employee) @key(mentorship)
}
```
