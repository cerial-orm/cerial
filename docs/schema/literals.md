---
title: Literals
parent: Schema
nav_order: 9
---

# Literals

Literals define union types for fields, allowing a field to hold one of several specific values or structured types.

## Basic Syntax

```cerial
literal Status { 'active', 'inactive', 'pending' }

literal Priority { 1, 2, 3 }

literal Mixed { 'low', 'high', 1, 2, true }
```

Literal variants can be:

| Variant kind | Example                                  | Description                   |
| ------------ | ---------------------------------------- | ----------------------------- |
| String       | `'active'`                               | Exact string value            |
| Integer      | `1`, `42`                                | Exact integer value           |
| Float        | `3.14`                                   | Exact float value             |
| Boolean      | `true`, `false`                          | Exact boolean value           |
| Broad type   | `String`, `Int`, `Float`, `Bool`, `Date` | Any value of that type        |
| Object ref   | `MyObject`                               | A defined object type         |
| Tuple ref    | `MyTuple`                                | A defined tuple type          |
| Literal ref  | `OtherLiteral`                           | Variants from another literal |

## Using Literals on Fields

```cerial
literal Status { 'active', 'inactive', 'pending' }

model User {
  id Record @id
  status Status              // required
  role Status?               // optional
  prevStatus Status? @nullable  // optional + nullable
  tags Status[]              // array of literal values
}
```

## Broad Types

Broad type variants accept any value of that type, not just specific values:

```cerial
literal Flexible { String, Int }
```

```typescript
// Accepts any string or any integer
await client.db.Model.create({
  data: { value: 'anything' }, // OK
});
await client.db.Model.create({
  data: { value: 12345 }, // OK
});
```

## Literal Composition

A literal can include variants from another literal:

```cerial
literal Status { 'active', 'inactive', 'pending' }
literal ExtendedStatus { Status, 'archived', 'deleted' }
// ExtendedStatus = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted'
```

The referenced literal's variants are fully expanded and deduplicated.

## Object Variants

Literals can include object types as variants:

```cerial
object Point {
  x Float
  y Float
}

literal Shape { 'none', Point }
```

```typescript
// Create with string variant
await client.db.Model.create({
  data: { shape: 'none' },
});

// Create with object variant — all required fields must be present
await client.db.Model.create({
  data: { shape: { x: 1.5, y: 2.5 } },
});
```

Object fields support optional and nullable modifiers:

```cerial
object PointOpt {
  label String          // required
  x Float?              // optional (can be absent)
  y Float? @nullable    // optional + nullable (can be absent or null)
}

literal ShapeOpt { 'none', PointOpt }
```

### Nesting Restrictions

Objects used in literals must be **flat** — they can only contain:

- Primitive fields (`String`, `Int`, `Float`, `Bool`, `Date`)
- Literal-typed fields (if the literal has only primitive variants)

Objects with nested object fields, tuple fields, or complex literal fields are rejected at parse time.

### Decorator Behavior

Only type-level modifiers (`?` and `@nullable`) are enforced when an object is stored through a literal. Other decorators (`@default`, `@createdAt`, `@updatedAt`, `@readonly`) cannot be expressed in the inline type definition and will **not** apply through the literal path. A warning is shown during generation if decorated objects are used in literals.

The same object can be used both in a literal and directly on a model field — decorators apply normally when used directly.

## Tuple Variants

Literals can include tuple types as variants:

```cerial
tuple Coord {
  x Float,
  y Float
}

literal Position { 'origin', Coord }
```

```typescript
// String variant
await client.db.Model.create({
  data: { pos: 'origin' },
});

// Tuple variant — array form
await client.db.Model.create({
  data: { pos: [1.5, 2.5] },
});

// Tuple variant — object form (named elements)
await client.db.Model.create({
  data: { pos: { x: 1.5, y: 2.5 } },
});
```

Tuples used in literals follow the same nesting restrictions as objects: only primitive elements and simple literal-typed elements are allowed.

## Generated Types

For a literal with only primitive variants:

```cerial
literal Status { 'active', 'inactive', 'pending' }
```

```typescript
type Status = 'active' | 'inactive' | 'pending';
```

For a literal with object/tuple variants, both output and input types are generated:

```cerial
literal Shape { 'none', Point }
```

```typescript
// Output type (from queries)
type Shape = 'none' | Point;

// Input type (for create/update) — uses input variant of object/tuple
type ShapeInput = 'none' | PointInput;
```

Key points:

- Output uses the base type (`Point`), input uses the input type (`PointInput`)
- For tuples: output is always array form, input accepts both array and object form
- Literal fields are excluded from `OrderBy` types
- Literal fields use boolean-only `select` (no sub-field selection through the union)

## Filtering

Literal where types support `eq`, `neq`, `in`, and `notIn`:

```typescript
// Shorthand eq
await client.db.User.findMany({
  where: { status: 'active' },
});

// Full where object
await client.db.User.findMany({
  where: { status: { neq: 'pending' } },
});

// in/notIn
await client.db.User.findMany({
  where: { status: { in: ['active', 'inactive'] } },
});
```

Additional operators are available based on variant types:

| Condition                            | Additional operators                 |
| ------------------------------------ | ------------------------------------ |
| All variants are numeric             | `gt`, `gte`, `lt`, `lte`, `between`  |
| Includes broad `String` type         | `contains`, `startsWith`, `endsWith` |
| Mixed types (string + number + bool) | Only `eq`, `neq`, `in`, `notIn`      |

For array literal fields:

```typescript
await client.db.User.findMany({
  where: { tags: { has: 'active' } },
});
```

## Database Schema

Cerial generates SurrealDB type constraints that match the literal definition:

```cerial
literal Status { 'active', 'inactive', 'pending' }
literal Shape { 'none', Point }
```

Generates:

```sql
DEFINE FIELD status ON TABLE user TYPE 'active' | 'inactive' | 'pending';
DEFINE FIELD shape ON TABLE model TYPE 'none' | { x: float, y: float };
```

Object variants are inlined with their field types, enforcing the exact shape at the database level. Optional fields use `option<T>`, nullable fields use `T | null`.

## Atomic Values

Literal values are **atomic** — they are always fully replaced, never merged. When you update a literal field from one variant to another, you provide the complete new value:

```typescript
// Switch from string to object — provide the full object
await client.db.Model.updateMany({
  where: { id: record.id },
  data: { shape: { x: 1.0, y: 2.0 } },
});

// Switch from object back to string
await client.db.Model.updateMany({
  where: { id: record.id },
  data: { shape: 'none' },
});
```

There is no partial update for literal fields — if you pass an object variant, all required fields must be present.
