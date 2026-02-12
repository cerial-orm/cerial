---
title: '@defaultAlways'
parent: Decorators
grand_parent: Schema
nav_order: 4.5
---

# @defaultAlways

Sets a default value for a field that is re-applied on **every write** (create and update) when the field is not explicitly provided. This is the general-purpose version of `DEFAULT ALWAYS` in SurrealDB.

## Syntax

```cerial
@defaultAlways(value)
```

Supported value types:

| Value            | Example                   | Description           |
| ---------------- | ------------------------- | --------------------- |
| String literal   | `@defaultAlways("dirty")` | Default string value  |
| Integer literal  | `@defaultAlways(0)`       | Default integer value |
| Float literal    | `@defaultAlways(1.5)`     | Default float value   |
| `true` / `false` | `@defaultAlways(false)`   | Default boolean value |
| `null`           | `@defaultAlways(null)`    | Default to null       |

## When to Use

`@defaultAlways` is for fields whose value should **reset to a known default on every update** unless explicitly overridden. The strongest use cases are **dirty flags** and **review gates** -- fields whose meaning is inherently tied to "something changed":

- **Review gates**: Any edit to a record should require re-review
- **Sync/dirty flags**: Any modification marks the record as needing external sync
- **Retry counters**: Reset to zero after each update

{: .warning }

> Unlike `@default`, which only fires on create, `@defaultAlways` resets the field on **every update** where the field is omitted. This can be surprising if you expect a value to persist across updates. Only use it when the "reset on every write" behavior is intentional.

## Basic Usage

```cerial
model Article {
  id Record @id
  title String
  content String
  reviewed Bool @defaultAlways(false)
  needsSync Bool @defaultAlways(true)
}
```

```typescript
// Create — @defaultAlways fields auto-filled when omitted
const article = await db.Article.create({
  data: { title: 'Draft', content: 'Hello' },
});
// article.reviewed === false
// article.needsSync === true

// Override on create — user value respected
const article2 = await db.Article.create({
  data: { title: 'Pre-approved', content: '...', reviewed: true },
});
// article2.reviewed === true

// Update — omitted @defaultAlways fields reset to their default
await db.Article.updateUnique({
  where: { id: article2.id },
  data: { content: 'Edited content' },
});
// reviewed resets to false (content was edited, needs re-review)
// needsSync resets to true (record was modified)

// Update — explicit value overrides the reset
await db.Article.updateUnique({
  where: { id: article2.id },
  data: { content: 'Minor fix', reviewed: true },
});
// reviewed stays true (explicitly provided)
```

## How It Works

`@defaultAlways(value)` generates `DEFAULT ALWAYS value` in SurrealDB. On updates, Cerial injects `field = NONE` for any `@defaultAlways` field not present in the update data, which triggers SurrealDB's `DEFAULT ALWAYS` mechanism to re-apply the default value.

## Object Fields

`@defaultAlways` can be applied to fields within object definitions:

```cerial
object ReviewMeta {
  note String @defaultAlways("pending review")
  flagged Bool @defaultAlways(false)
}

model Document {
  id Record @id
  title String
  meta ReviewMeta?
}
```

When an object has `@defaultAlways` fields, Cerial generates an additional `ReviewMetaCreateInput` type where those fields are optional. On merge-style object updates, omitted sub-fields trigger dot-notation NONE injection to reset them.

```typescript
// Create — sub-fields auto-filled
const doc = await db.Document.create({
  data: { title: 'Report', meta: {} },
});
// doc.meta.note === "pending review"
// doc.meta.flagged === false

// Merge update — omitted sub-fields reset
await db.Document.updateUnique({
  where: { id: doc.id },
  data: { meta: { note: 'needs revision' } },
});
// meta.note === "needs revision" (explicitly provided)
// meta.flagged === false (reset by @defaultAlways)
```

## Comparison

| Decorator                    | Stored | Set on create       | Reset on update     | Can override | Field types |
| ---------------------------- | ------ | ------------------- | ------------------- | ------------ | ----------- |
| [`@default(value)`](default) | Yes    | Yes (when absent)   | No                  | Yes          | Any         |
| `@defaultAlways(value)`      | Yes    | Yes (when absent)   | Yes (when absent)   | Yes          | Any         |
| [`@updatedAt`](updated-at)   | Yes    | Yes (`time::now()`) | Yes (`time::now()`) | Yes          | `Date` only |
| [`@createdAt`](created-at)   | Yes    | Yes (`time::now()`) | No                  | Yes          | `Date` only |
| [`@now`](now)                | No     | N/A (computed)      | N/A (computed)      | No           | `Date` only |

## Mutual Exclusivity

`@defaultAlways` cannot be combined with `@default`, `@now`, `@createdAt`, or `@updatedAt` on the same field. Each field gets one default strategy.
