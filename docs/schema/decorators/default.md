---
title: '@default'
parent: Decorators
grand_parent: Schema
nav_order: 4
---

# @default

Sets a default value for a field when no value is provided on create.

## Syntax

```cerial
@default(value)
```

Supported value types:

| Value            | Example               | Description                         |
| ---------------- | --------------------- | ----------------------------------- |
| String literal   | `@default("pending")` | Default string value                |
| Integer literal  | `@default(0)`         | Default integer value               |
| `true` / `false` | `@default(true)`      | Default boolean value               |
| `null`           | `@default(null)`      | Default to null (special semantics) |

## Basic Usage

```cerial
model Task {
  id Record @id
  status String @default("pending")
  retryCount Int @default(0)
  isActive Bool @default(true)
  priority Int @default(1)
}
```

```typescript
const task = await db.Task.create({
  data: {},
  // status: "pending", retryCount: 0, isActive: true, priority: 1
});

// You can still override defaults
const urgent = await db.Task.create({
  data: { status: 'urgent', priority: 10 },
  // status: "urgent", retryCount: 0, isActive: true, priority: 10
});
```

## The `@default(null)` Pattern

The `@default(null)` decorator has special semantics for optional fields. It changes how omitted values are handled:

**Without `@default(null)`:**

```cerial
model User {
  id Record @id
  bio String?           # no default
}
```

```typescript
// Omitting bio → NONE (field absent, not stored in DB)
await db.User.create({ data: { name: 'Alice' } });
```

**With `@default(null)`:**

```cerial
model User {
  id Record @id
  bio String? @default(null)
}
```

```typescript
// Omitting bio → null (field stored as null in DB)
await db.User.create({ data: { name: 'Alice' } });
// bio is stored as null, queryable with { bio: { eq: null } }
```

This distinction matters because SurrealDB treats NONE (field absent) and null (field exists with null value) differently. See [Optional Fields](../optional-fields) for details on NONE vs null semantics.

## Object Fields

`@default` can be applied to fields within object definitions. The default value is applied at the database level via `DEFINE FIELD ... DEFAULT`.

```cerial
object ContactInfo {
  email Email
  city String @default("Unknown")
}

model User {
  id Record @id
  contact ContactInfo
}
```

When an object has `@default` fields, Cerial generates an additional `ContactInfoCreateInput` type where those fields are optional. The parent model's `Create` type uses this input automatically:

```typescript
// city defaults to "Unknown" when omitted
const user = await db.User.create({
  data: {
    contact: { email: 'alice@example.com' },
    // city will be "Unknown"
  },
});
```

## Summary

| Schema                              | Omitted on create | Explicit value      |
| ----------------------------------- | ----------------- | ------------------- |
| `status String @default("pending")` | `"pending"`       | Uses provided value |
| `count Int @default(0)`             | `0`               | Uses provided value |
| `active Bool @default(true)`        | `true`            | Uses provided value |
| `bio String?`                       | NONE (absent)     | Uses provided value |
| `bio String? @default(null)`        | `null`            | Uses provided value |
