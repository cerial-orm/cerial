---
title: Enums
parent: Schema
nav_order: 6
---

# Enums

Enums define a set of named string constants for a field. They work like enums in Prisma — you declare a fixed set of allowed values, and Cerial generates both a TypeScript union type and a const object for runtime access.

## Syntax

Declare an enum with the `enum` keyword followed by a name and a list of values:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }
```

Values can also be written on separate lines:

```cerial
enum Role {
  ADMIN
  EDITOR
  VIEWER
}
```

Pick one style per block — either comma-separated on a single line, or newline-separated with one value per line. Do not mix both styles in the same enum.

**Rules:**

- No quotes around values — enum values are bare identifiers
- No casing enforcement — use whatever convention fits your project (`UPPER_CASE`, `PascalCase`, `camelCase`)
- Each value must be a valid identifier (letters, digits, underscores; cannot start with a digit)

## Generated Types

For an enum like:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }
```

Cerial generates three things:

### Const Object

A `const` object with each value as both key and value, useful for runtime access:

```typescript
const StatusEnum = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING',
} as const;
```

### Union Type

A string union type for use in type annotations:

```typescript
type StatusEnumType = 'ACTIVE' | 'INACTIVE' | 'PENDING';
```

### Where Type

A where interface for filtering:

```typescript
interface StatusEnumWhere {
  eq?: StatusEnumType;
  neq?: StatusEnumType;
  in?: StatusEnumType[];
  notIn?: StatusEnumType[];
  contains?: string;
  startsWith?: string;
  endsWith?: string;
}
```

## Using Enums in Models

Enum types are used on fields just like any other type:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }
enum Role { ADMIN, EDITOR, VIEWER }

model User {
  id Record @id
  name String
  status Status                   # required enum field
  role Role? @default('VIEWER')   # optional with default
  prevStatus Status? @nullable    # optional + nullable
  tags Role[]                     # array of enum values
}
```

```typescript
const user = await db.User.create({
  data: {
    name: 'Alice',
    status: 'ACTIVE',
    // role defaults to 'VIEWER'
  },
});

console.log(user.status); // 'ACTIVE'
console.log(user.role); // 'VIEWER'
```

## Using Enums in Objects

Enum fields work the same way in embedded object types:

```cerial
enum Priority { LOW, MEDIUM, HIGH, CRITICAL }

object TaskMeta {
  priority Priority
  tags Priority[]
}

model Task {
  id Record @id
  title String
  meta TaskMeta
}
```

```typescript
await db.Task.create({
  data: {
    title: 'Fix bug',
    meta: {
      priority: 'HIGH',
      tags: ['HIGH', 'CRITICAL'],
    },
  },
});
```

## Default Values

Use `@default` with a string value matching one of the enum variants:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }

model User {
  id Record @id
  name String
  status Status @default('ACTIVE')
}
```

```typescript
// status defaults to 'ACTIVE' when omitted
const user = await db.User.create({
  data: { name: 'Alice' },
});

console.log(user.status); // 'ACTIVE'
```

## Filtering

Enum fields support string-based where operators. You can use shorthand equality or the full where object syntax.

### Shorthand Equality

```typescript
await db.User.findMany({
  where: { status: 'ACTIVE' },
});
```

### eq / neq

```typescript
await db.User.findMany({
  where: { status: { eq: 'ACTIVE' } },
});

await db.User.findMany({
  where: { status: { neq: 'PENDING' } },
});
```

### in / notIn

```typescript
await db.User.findMany({
  where: { status: { in: ['ACTIVE', 'PENDING'] } },
});

await db.User.findMany({
  where: { status: { notIn: ['INACTIVE'] } },
});
```

### contains / startsWith / endsWith

Since enum values are strings, string matching operators are available:

```typescript
await db.User.findMany({
  where: { status: { startsWith: 'ACT' } },
});

await db.User.findMany({
  where: { status: { endsWith: 'IVE' } },
});

await db.User.findMany({
  where: { status: { contains: 'CTIV' } },
});
```

### Array Enum Fields

Array enum fields use array operators:

```typescript
await db.User.findMany({
  where: { tags: { has: 'ADMIN' } },
});

await db.User.findMany({
  where: { tags: { hasAll: ['ADMIN', 'EDITOR'] } },
});

await db.User.findMany({
  where: { tags: { hasAny: ['ADMIN', 'VIEWER'] } },
});
```

## Ordering

Enum fields support `orderBy` since they are string values. SurrealDB orders them alphabetically.

```typescript
// Order by a single enum field
const users = await db.User.findMany({
  orderBy: { status: 'asc' },
});

// Order by multiple enum fields
const items = await db.EnumMultiple.findMany({
  orderBy: { role: 'asc', color: 'desc' },
});

// Order by an enum field inside an embedded object
const records = await db.EnumWithObject.findMany({
  orderBy: { address: { severity: 'asc' } },
});
```

Note that non-enum [Literals](literals) are excluded from `orderBy` because they can contain mixed types where ordering is ambiguous.

## Using the Const Object

The generated const object provides runtime access to enum values. Use it instead of string literals to get autocompletion and refactoring support:

```typescript
import { StatusEnum, RoleEnum } from './generated/client';

// Use in queries
await db.User.findMany({
  where: { status: StatusEnum.ACTIVE },
});

// Use in application logic
function isEditable(role: string): boolean {
  return role === RoleEnum.ADMIN || role === RoleEnum.EDITOR;
}

// Use in data creation
await db.User.create({
  data: {
    name: 'Bob',
    status: StatusEnum.PENDING,
    role: RoleEnum.VIEWER,
  },
});
```

## Enums vs Literals

Enums are string-only named constants with a generated const object for runtime access. Literals are more general — they support any type combination (strings, numbers, booleans, broad types, objects, tuples).

If you only need a fixed set of string values, enums are the cleaner choice. If you need mixed types or structured variants, use [Literals](literals).

See [Enums vs Literals](enums-vs-literals) for a detailed comparison.
