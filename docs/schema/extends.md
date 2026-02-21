---
title: Extends (Inheritance)
parent: Schema
nav_order: 11
---

# Extends (Inheritance)

Cerial supports schema-level inheritance across all type kinds: models, objects, tuples, enums, and literals. A child type inherits the fields (or elements, values, variants) from a parent type and can add its own.

## Syntax

```cerial
model Child extends Parent {
  // additional fields
}

model Subset extends Parent[field1, field2] {
  // picks only field1 and field2 from Parent
}

model Without extends Parent[!field1] {
  // inherits everything except field1
}
```

Three forms are available:

| Form | Syntax | Effect |
| --- | --- | --- |
| Full inherit | `extends Parent` | All parent fields/elements/values |
| Pick | `extends Parent[a, b]` | Only the listed fields |
| Omit | `extends Parent[!a, !b]` | Everything except the listed fields |

Pick and omit cannot be mixed in the same declaration.

## Model Extends

Models can extend [abstract](abstract) models to inherit fields. The child gets its own table, its own generated types, and its own client accessor. Both concrete and abstract models can only extend abstract models.

```cerial
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}

model User extends BaseEntity {
  email Email @unique
  name String
  age Int?
}
```

`User` ends up with five fields: `id`, `createdAt`, `updatedAt`, `email`, and `name`, `age`. The generated types reflect the full flattened set:

```typescript
interface User {
  id: CerialId<string>;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  name: string;
  age: number | undefined;
}
```

### Relations in Inherited Models

Relations and their backing `Record` fields inherit normally. You can also add new relations in the child body:

```cerial
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}

model BlogPost extends BaseEntity {
  title String
  authorId Record
  author Relation @field(authorId) @model(BlogAuthor)
}
```

When using omit, you can exclude relation fields and their backing `Record` fields:

```cerial
model PostSummary extends BlogPost[!author, !authorId] {
  summary String?
  wordCount Int?
}
```

`PostSummary` inherits `id`, `createdAt`, and `title` but not the relation or FK.

## Object Extends

Objects can extend other objects to inherit sub-fields:

```cerial
object BaseAddress {
  street String
  city String
  zip String
  country String @default('US')
}

object DetailedAddress extends BaseAddress {
  apartment String?
  coordinates Float[]
}
```

`DetailedAddress` has six fields: `street`, `city`, `zip`, `country`, `apartment`, `coordinates`. Use the extended object on model fields as usual:

```cerial
model Store {
  id Record @id
  name String
  address DetailedAddress
}
```

## Tuple Extends

Tuples append new elements after the parent's elements:

```cerial
tuple Pair { String, Int }
tuple Triple extends Pair { Bool }
```

`Triple` is `[String, Int, Bool]`. Named elements work the same way:

```cerial
tuple NamedPair { name String, age Int }
tuple NamedTriple extends NamedPair { active Bool }
```

`NamedTriple` is `[name: String, age: Int, active: Bool]`.

### Index-Based Pick and Omit

Tuples use zero-based indices instead of field names for pick and omit:

```cerial
tuple Base { String, Int, Bool }

tuple FirstTwo extends Base[0, 1] { }
// [String, Int]

tuple WithoutSecond extends Base[!1] { }
// [String, Bool]
```

## Enum Extends

Enums inherit values from a parent enum and can add new ones:

```cerial
enum BaseRole { Admin, User, Moderator }
enum ExtendedRole extends BaseRole { SuperAdmin, Guest }
```

`ExtendedRole` contains all five values: `Admin`, `User`, `Moderator`, `SuperAdmin`, `Guest`.

Pick and omit work with value names:

```cerial
enum CoreRole extends BaseRole[Admin, User] { }
// Admin, User

enum NonAdminRole extends BaseRole[!Admin] { }
// User, Moderator
```

## Literal Extends

Literals inherit variants from a parent literal and can add new ones:

```cerial
literal BasePriority { 'low', 'medium', 'high' }
literal ExtendedPriority extends BasePriority { 'critical', 'urgent' }
```

`ExtendedPriority` generates `'low' | 'medium' | 'high' | 'critical' | 'urgent'`.

Pick and omit work with the variant values. For boolean variants, use the value directly:

```cerial
literal Mixed { 'active', 'inactive', true, false }
literal StringOnly extends Mixed[true, false] { }
literal NoBools extends Mixed[!true, !false] { }
```

Numeric literal variants use the number directly in pick/omit:

```cerial
literal Level { 1, 2, 3 }
literal ExtendedLevel extends Level { 4, 5 }
```

## Pick and Omit

Pick and omit give you fine-grained control over which fields to inherit.

### Pick

List the fields you want. Everything else from the parent is dropped:

```cerial
model LimitedUser extends BaseUser[email, name] {
  // only email and name from BaseUser
  bannedUntil Date?
}
```

### Omit

Prefix field names with `!` to exclude them. Everything else is inherited:

```cerial
model Admin extends BaseUser[!isActive] {
  level Int @default(1)
  permissions String[]
}
```

### Empty Body

If pick or omit gives you everything you need, the child body can be empty:

```cerial
enum CoreRole extends BaseRole[Admin, User] { }
tuple FirstTwo extends BasePair[0, 1] { }
```

## Multi-Level Inheritance

Inheritance chains can go as deep as you need. Each level flattens the full chain:

```cerial
abstract model L1Base {
  id Record @id
  createdAt Date @createdAt
}

abstract model L2Mid extends L1Base {
  name String
  description String?
}

abstract model L3High extends L2Mid {
  tags String[]
  metadata Int?
}

model Concrete extends L3High {
  status String @default('active')
}
```

`Concrete` gets all fields from every level: `id`, `createdAt`, `name`, `description`, `tags`, `metadata`, `status`.

To share fields between concrete models, extract the common fields into an abstract intermediary:

```cerial
abstract model BaseUserFull extends BaseEntity {
  email Email @unique
  name String
  age Int?
}

model User extends BaseUserFull {
  // User-specific fields
}

model PremiumUser extends BaseUserFull {
  subscriptionTier String @default('basic')
}
```

Both `User` and `PremiumUser` inherit the same fields from the abstract parent, each getting their own table.

## Field Override

A child can redefine a field that it inherits. The child's definition replaces the parent's:

```cerial
abstract model BaseUser extends BaseEntity {
  email Email @unique
  name String
  isActive Bool @default(true)
}

model SuperAdmin extends BaseUser {
  role String @default('superadmin')
  level Int @default(99)
}
```

If the parent marks a field as [`!!private`](modifiers/private), it cannot be overridden. The child can still inherit it, and it can omit it with pick/omit syntax, but redefining it in the child body is an error.

## Cross-File Extends

Types can extend parents defined in other `.cerial` files, as long as both files belong to the same schema entry (the same schema folder or config group). There's no import syntax needed. Cerial resolves all types across files within a schema entry before applying inheritance.

```cerial
// file: base.cerial
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}
```

```cerial
// file: users.cerial
model User extends BaseEntity {
  email Email @unique
  name String
}
```

Both files must be in the same schema folder. Cross-schema extends (between different schema entries in a multi-schema config) is not supported.

## Rules and Restrictions

| Rule | Detail |
| --- | --- |
| Single parent only | `extends A, B` is not allowed. One parent per type. |
| Same kind only | A model can only extend a model. An object can only extend an object. No cross-kind extends. |
| Same schema entry | Both parent and child must belong to the same schema entry (folder/config group). |
| Abstract models only | Only models can be declared `abstract`. Objects, tuples, enums, and literals cannot be abstract. |
| Models can only extend abstract | All models (both concrete and abstract) can only extend abstract models. A model cannot extend a concrete model. |
| No circular references | A type cannot extend itself or create a circular chain. |
| `!!private` fields | Private fields are inherited but cannot be overridden in the child body. They can still be omitted via pick/omit. |
| Pick/omit not mixed | A single extends clause uses either pick or omit, not both. |
