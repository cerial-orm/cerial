---
title: Decorators
parent: Schema
nav_order: 4
has_children: true
---

# Decorators

Decorators modify field and model behavior in Cerial schemas. Field-level decorators are prefixed with `@` and placed after the field type. Model-level composite directives use `@@` and are placed at the end of the model block.

```cerial
model User {
  id Record @id
  email Email @unique
  firstName String
  lastName String
  createdAt Date @createdAt
  tags String[] @distinct @sort

  @@unique(fullName, [firstName, lastName])
}
```

## Field Decorators

| Decorator                          | Description             | Applies To                   |
| ---------------------------------- | ----------------------- | ---------------------------- |
| [`@id`](id)                        | Record identifier       | One per model, `Record` type |
| [`@unique`](unique)                | Unique constraint       | Any storable field           |
| [`@index`](index.decorator)        | Non-unique index        | Any storable field           |
| [`@now`](now)                      | Computed timestamp      | `Date` fields                |
| [`@createdAt`](created-at)         | Creation timestamp      | `Date` fields                |
| [`@updatedAt`](updated-at)         | Last-modified timestamp | `Date` fields                |
| [`@default(value)`](default)       | Default value           | Literal values or `null`     |
| [`@field(name)`](field-and-model)  | Relation storage field  | `Relation` fields            |
| [`@model(Model)`](field-and-model) | Relation target model   | `Relation` fields            |
| [`@onDelete(action)`](on-delete)   | Delete behavior         | Optional `Relation?` only    |
| [`@key(name)`](key)                | Relation disambiguation | `Relation` fields            |
| [`@distinct`](distinct)            | Array deduplication     | Array fields                 |
| [`@sort` / `@sort(false)`](sort)   | Array ordering          | Array fields                 |

## Composite Directives

| Directive                                      | Description                 | Applies To  |
| ---------------------------------------------- | --------------------------- | ----------- |
| [`@@unique(name, [fields])`](composite-unique) | Composite unique constraint | Model level |
| [`@@index(name, [fields])`](composite-index)   | Composite non-unique index  | Model level |

## Decorators on Object Fields

A subset of decorators can also be applied to fields within object definitions. Relation and identity decorators (`@id`, `@field`, `@model`, `@onDelete`, `@key`) are not allowed on object fields. Allowed decorators on object fields: `@default`, `@now`, `@createdAt`, `@updatedAt`, `@unique`, `@index`, `@distinct`, `@sort`.

```cerial
object ContactInfo {
  email Email
  city String @default("Unknown")
  createdAt Date @createdAt
  tags String[] @distinct
  zip String @unique
}
```

See [Objects](../../objects/) for details on how decorators behave within objects.

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
