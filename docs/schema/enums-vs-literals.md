---
title: Enums vs Literals
parent: Schema
nav_order: 7
---

# Enums vs Literals

Cerial offers two ways to define union-like field types: **enums** and **literals**. Both resolve to SurrealDB `literal` types under the hood, but they serve different purposes and have different capabilities.

## Quick Comparison

| Feature                   | Enums                                              | Literals                                                             |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| **Variant types**         | String-only                                        | String, Int, Float, Bool, broad types, objects, tuples, literal refs |
| **Const object**          | Yes (`StatusEnum`)                                 | No                                                                   |
| **Union type**            | Yes (`StatusEnumType`)                             | Yes (`Status`)                                                       |
| **Where operators**       | eq, neq, in, notIn, contains, startsWith, endsWith | eq, neq, in, notIn (+ more based on variant types)                   |
| **Runtime access**        | `StatusEnum.ACTIVE`                                | String literals only                                                 |
| **Composition**           | No (standalone only)                               | Yes (literal refs, enum refs)                                        |
| **Object/tuple variants** | No                                                 | Yes                                                                  |
| **Sub-field select**      | No                                                 | No (boolean select only)                                             |
| **OrderBy**               | Yes (string ordering)                              | Excluded (mixed types)                                               |

## When to Use Enums

Use enums when you have a **fixed set of string values** and want:

- A const object for runtime access (`StatusEnum.ACTIVE` instead of `'ACTIVE'`)
- Autocompletion and refactoring support via the const object
- A clean, Prisma-like declaration syntax

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }
enum Role { ADMIN, EDITOR, VIEWER }

model User {
  id Record @id
  status Status
  role Role
}
```

```typescript
import { StatusEnum, RoleEnum } from './generated/client';

// Runtime access via const object
if (user.role === RoleEnum.ADMIN) {
  // ...
}
```

## When to Use Literals

Use literals when you need **mixed types**, **structured variants**, or **composition**:

```cerial
# Mixed types — not possible with enums
literal Priority { 'low', 'medium', 'high', 1, 2, 3 }

# Broad types — accept any value of a type
literal Flexible { String, Int }

# Object variants — structured data in the union
object Point { x Float, y Float }
literal Shape { 'none', Point }

# Composition — combine multiple literals
literal Base { 'a', 'b' }
literal Extended { Base, 'c', 'd' }
```

## Cross-Referencing

Literals can reference enums. When a literal includes an enum, the enum's string values are inlined into the literal's union:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }

literal ExtendedStatus { Status, 'ARCHIVED', 'DELETED' }
# Resolves to: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'ARCHIVED' | 'DELETED'
```

This lets you build on existing enums when you need a broader set of values in a literal context.

## Database Representation

Both enums and literals generate the same SurrealDB type constraint — a `literal` union:

```cerial
enum Status { ACTIVE, INACTIVE, PENDING }
literal Priority { 'low', 'medium', 'high' }
```

Both produce equivalent migration output:

```sql
DEFINE FIELD status ON TABLE user TYPE 'ACTIVE' | 'INACTIVE' | 'PENDING';
DEFINE FIELD priority ON TABLE task TYPE 'low' | 'medium' | 'high';
```

The difference is purely at the TypeScript level: enums generate a const object and a dedicated where type, while literals generate only a union type.

## Decision Guide

- **"I have a fixed set of string labels"** → Use an enum
- **"I need numbers, booleans, or mixed types"** → Use a literal
- **"I want runtime access via a const object"** → Use an enum
- **"I need object or tuple variants in the union"** → Use a literal
- **"I want to compose unions from other unions"** → Use a literal (with literal refs or enum refs)
