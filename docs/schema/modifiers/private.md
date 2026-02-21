---
title: Private Fields (!!private)
parent: Modifiers
grand_parent: Schema
nav_order: 1
---

# Private Fields (!!private)

The `!!private` modifier prevents a field from being overridden in child types that use [extends](../extends). It protects fields that should stay exactly as the parent defined them.

## Syntax

Place `!!private` at the end of a field line, after all decorators:

```cerial
abstract model BaseEntity {
  id Record @id !!private
  createdAt Date @createdAt !!private
  updatedAt Date @updatedAt
}
```

`!!private` takes no arguments. It's not a decorator (no `@` prefix) but a field modifier.

## What Private Does

Private prevents one thing: **redefining the field in a child's body**. If a child tries to declare a field with the same name, Cerial raises an error during schema resolution.

```cerial
abstract model Base {
  id Record @id !!private
  name String !!private
}

// ERROR: Cannot override private field 'name'
model Child extends Base {
  name String @default('override')  // not allowed
}
```

### What Private Does Not Do

Private fields can still be:

- **Inherited** normally by children
- **Omitted** from pick lists (`extends Base[!name]`)
- **Excluded** from omit lists (just don't list them)

`!!private` controls override, not visibility. A child that doesn't need the field can simply omit it.

```cerial
abstract model Base {
  id Record @id !!private
  name String !!private
  email Email
}

// OK: picks only email, omitting private fields
model Subset extends Base[email] {
  role String
}

// OK: omits email, keeps private fields
model WithPrivate extends Base[!email] {
  tag String
}
```

## Where Allowed

| Location | Allowed |
| --- | --- |
| Model fields | Yes |
| Object fields | Yes |
| Tuple elements | Yes |
| Enum values | No |
| Literal variants | No |

### Model Fields

The most common use. Lock down identity and timestamp fields in abstract bases:

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
```

`User` inherits `id` and `createdAt` as-is. It can override `updatedAt` (not private) but not the other two.

### Object Fields

Protect specific sub-fields in shared object definitions:

```cerial
object BaseAddress {
  street String !!private
  city String
  zip String !!private
  country String @default('US')
}

object DetailedAddress extends BaseAddress {
  // street and zip are inherited but cannot be redefined here
  country String @default('USA')   // OK: not private
  apartment String?
}
```

### Tuple Elements

Protect tuple elements by position:

```cerial
tuple SecurePair { String !!private, Int !!private }

tuple Extended extends SecurePair {
  Bool  // appended as third element, OK
}
```

The first two elements are locked. New elements can still be appended.

## Combining with Decorators

`!!private` goes after all decorators. It works alongside any field-level decorator:

```cerial
abstract model Base {
  id Record @id !!private
  email Email @unique !!private
  createdAt Date @createdAt !!private
  role String @default('user') !!private
  tags String[] @distinct @sort !!private
}
```

The decorators apply as normal. `!!private` only adds the override-protection behavior on top.

## Practical Pattern

A common pattern pairs `abstract` models with `!!private` on structural fields, leaving domain fields open for override:

```cerial
abstract model Auditable {
  id Record @id !!private
  createdAt Date @createdAt !!private
  updatedAt Date @updatedAt !!private
  createdBy String !!private
}

model Invoice extends Auditable {
  amount Float
  status String @default('draft')
}

model Receipt extends Auditable {
  invoiceId Record
  paidAt Date
}
```

Every child gets consistent audit fields that can't be accidentally changed. Domain-specific fields are added freely in each child.
