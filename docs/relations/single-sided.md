---
title: Single-Sided Relations
parent: Relations
nav_order: 5
---

# Single-Sided Relations

A single-sided relation is one where only the PK side (forward relation) is defined. The target model has **no reverse relation** — it is unaware of the referencing model.

## Schema Definition

```cerial
model Article {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(Writer)
}

model Writer {
  id Record @id
  name String
  # No articles Relation[] - intentionally single-sided
}
```

The `Article` model has a forward relation to `Writer`, but `Writer` does not define a reverse `articles` relation. This is valid and intentional.

## Rules

- The FK field **must be optional** (`Record?`) and the Relation **must be optional** (`Relation?`) for single-sided relations.
- The target model has no knowledge of the referencing model.
- All CRUD operations work normally from the PK side.
- You can still query the reverse direction manually using where clauses on the FK field.

## Usage

### Creating

```typescript
// Create an article with an author
const article = await db.Article.create({
  data: {
    title: 'Understanding Single-Sided Relations',
    author: { connect: writerId },
  },
});

// Create an article without an author
const draft = await db.Article.create({
  data: { title: 'Draft Article' },
});
```

### Querying from the PK side

```typescript
// Include the forward relation
const article = await db.Article.findOne({
  where: { id: articleId },
  include: { author: true },
});
// article: { id: CerialId, title: string, authorId?: CerialId, author: Writer | null }
```

### Querying the reverse direction manually

Since `Writer` has no `articles` relation, you query the `Article` table directly:

```typescript
// Find all articles by a specific writer
const articles = await db.Article.findMany({
  where: { authorId: writerId },
});
```

### Updating

```typescript
// Change the author
await db.Article.updateMany({
  where: { id: articleId },
  data: { author: { connect: newWriterId } },
});

// Remove the author (removes authorId — NONE)
await db.Article.updateMany({
  where: { id: articleId },
  data: { author: { disconnect: true } },
});
```

## When to Use Single-Sided Relations

Single-sided relations are appropriate when the reverse lookup is not needed in your application logic.

| Scenario                        | Why Single-Sided                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Audit logs referencing a user   | Users don't need a `logs` relation cluttering their model                       |
| Articles referencing a category | Categories may be shared across many models, no need for reverse                |
| Bookmarks referencing a target  | The target doesn't need to know about bookmarks                                 |
| Temporary assignments           | A task references an assignee, but the assignee model is shared across services |

## Comparison with Bidirectional

| Aspect               | Single-Sided                       | Bidirectional                             |
| -------------------- | ---------------------------------- | ----------------------------------------- |
| Schema fields        | FK + forward relation on one model | FK + forward on one, reverse on the other |
| Include from PK side | Supported                          | Supported                                 |
| Include from target  | Not available                      | Supported via reverse relation            |
| Manual reverse query | Yes, via `where: { fkField: id }`  | Not needed (use `include`)                |
| Model coupling       | Low — target is independent        | Higher — both models reference each other |

## Delete Behavior

Since the relation is optional (`Record?`), the default delete behavior is `SetNone`. When the referenced Writer is deleted, `Article.authorId` is removed (NONE). Add `@nullable` to `authorId` for `SetNull` behavior. You can override this with `@onDelete`:

```cerial
model Article {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(Writer) @onDelete(Cascade)
}
```

See [Delete Behavior](on-delete.md) for all options.
