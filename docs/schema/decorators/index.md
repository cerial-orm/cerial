---
title: Decorators
parent: Schema
nav_order: 4
has_children: true
---

# Decorators

Decorators modify field behavior in Cerial schemas. They are prefixed with `@` and placed after the field type. Decorators are **only allowed on model fields** — object fields cannot have decorators.

```cerial
model User {
  id Record @id
  email Email @unique
  name String
  createdAt Date @now
  tags String[] @distinct @sort
}
```

## Decorator Reference

| Decorator                          | Description             | Applies To                   |
| ---------------------------------- | ----------------------- | ---------------------------- |
| [`@id`](id)                        | Record identifier       | One per model, `Record` type |
| [`@unique`](unique)                | Unique constraint       | Any storable field           |
| [`@now`](now)                      | Auto-set timestamp      | `Date` fields                |
| [`@default(value)`](default)       | Default value           | Literal values or `null`     |
| [`@field(name)`](field-and-model)  | Relation storage field  | `Relation` fields            |
| [`@model(Model)`](field-and-model) | Relation target model   | `Relation` fields            |
| [`@onDelete(action)`](on-delete)   | Delete behavior         | Optional `Relation?` only    |
| [`@key(name)`](key)                | Relation disambiguation | `Relation` fields            |
| [`@distinct`](distinct)            | Array deduplication     | Array fields                 |
| [`@sort` / `@sort(false)`](sort)   | Array ordering          | Array fields                 |

## Combining Decorators

Multiple decorators can be applied to a single field, separated by spaces:

```cerial
model Article {
  id Record @id
  tags String[] @distinct @sort
  author Relation @field(authorId) @model(User)
  reviewer Relation? @field(reviewerId) @model(User) @key(reviewer) @onDelete(SetNull)
}
```

The order of decorators does not matter.
