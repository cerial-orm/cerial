---
title: '@flexible'
parent: Decorators
grand_parent: Schema
nav_order: 9
---

# @flexible

Marks an object-type field as flexible, allowing it to store arbitrary extra fields alongside the defined typed fields. Known fields retain their type safety, while unknown fields are accepted as `any`.

## Syntax

```cerial
model User {
  id Record @id
  address Address @flexible
}
```

`@flexible` takes no arguments and can only be applied to fields whose type is an object (not scalars, arrays of scalars, or relations).

## When to Use

Use `@flexible` when a field needs a schema-defined core structure but must also accept dynamic, user-defined properties:

- **User preferences** with a known base shape but extensible settings
- **Metadata fields** where known keys are typed but additional keys vary per record
- **Integration payloads** with a stable core and provider-specific extras
- **Feature flags** with known defaults and dynamic overrides

## Basic Usage

```cerial
object Address {
  street String
  city String
  zip String?
}

model Customer {
  id Record @id
  name String
  billing Address @flexible
  shipping Address
}
```

`billing` is flexible — it accepts `street`, `city`, `zip` plus any extra keys. `shipping` uses the same `Address` object but is strict — only `street`, `city`, and `zip` are allowed.

```typescript
// Create with extra fields on the flexible field
const customer = await db.Customer.create({
  data: {
    name: 'Alice',
    billing: { street: '123 Main', city: 'NYC', floor: 5, buzzer: 'A3' },
    shipping: { street: '456 Oak', city: 'LA' },
  },
});

customer.billing.street; // string — typed
customer.billing.floor; // any — extra field, accessible
customer.billing.buzzer; // any — extra field, accessible
```

## Type Behavior

The `@flexible` decorator affects generated TypeScript types by intersecting the base object interface with `Record<string, any>`:

| Aspect           | Strict field            | Flexible field                                |
| ---------------- | ----------------------- | --------------------------------------------- |
| Interface        | `Address`               | `Address & Record<string, any>`               |
| Input            | `AddressInput`          | `AddressInput & Record<string, any>`          |
| Create           | Known fields only       | Known fields + arbitrary extras               |
| Update (merge)   | `Partial<AddressInput>` | `Partial<AddressInput & Record<string, any>>` |
| Update (set)     | `{ set: AddressInput }` | `{ set: AddressInput & Record<string, any> }` |
| Where            | `AddressWhere`          | `AddressWhere & { [key: string]: any }`       |
| Return type      | `Address`               | `Address & Record<string, any>`               |
| Select / OrderBy | Same as strict          | Same as strict (known fields only)            |

Known fields retain full type safety. Extra fields are typed as `any`.

## Field-Level, Not Object-Level

`@flexible` is applied per field, not on the object definition itself. The same object type can be flexible on one field and strict on another:

```cerial
object Metadata {
  version Int
}

model Document {
  id Record @id
  config Metadata @flexible   // accepts extra keys
  audit Metadata              // strict — version only
}
```

## Nested Flexible

`@flexible` can be applied to object-typed fields within object definitions:

```cerial
object Tags {
  label String
}

object Profile {
  bio String
  tags Tags @flexible
}

model User {
  id Record @id
  profile Profile
}
```

Here `profile` itself is strict (only `bio` and `tags`), but `profile.tags` is flexible — it accepts `label` plus extra keys.

## Optional and Array Fields

`@flexible` works with optional fields and array fields:

```cerial
model User {
  id Record @id
  address Address @flexible          // required flexible
  shipping Address? @flexible        // optional flexible
  locations Address[] @flexible      // array of flexible objects
}
```

```typescript
// Optional flexible — can be omitted
await db.User.create({
  data: {
    address: { street: 'Main', city: 'NYC', custom: true },
  },
});

// Array of flexible objects — each element accepts extras
await db.User.create({
  data: {
    address: { street: 'Main', city: 'NYC' },
    locations: [
      { street: 'Home', city: 'NYC', floor: 3 },
      { street: 'Work', city: 'SF', desk: 'A5' },
    ],
  },
});
```

## Querying Flexible Fields

### Where (known fields)

Known fields support all standard operators:

```typescript
const results = await db.Customer.findMany({
  where: { billing: { city: { contains: 'NY' } } },
});
```

### Where (extra fields)

Extra fields can be filtered using direct equality or operator objects:

```typescript
// Equality on extra field
const results = await db.Customer.findMany({
  where: { billing: { floor: 5 } },
});

// Operator on extra field
const results2 = await db.Customer.findMany({
  where: { billing: { floor: { gt: 3 } } },
});
```

{: .note }

> Since extra field types are `any`, the runtime passes values through to SurrealDB without type validation. SurrealDB handles the comparison at the database level.

### Logical operators with extra fields

Use model-level `OR`/`NOT`/`AND` to combine flexible field conditions:

```typescript
const results = await db.Customer.findMany({
  where: {
    OR: [{ billing: { floor: 5 } }, { billing: { floor: 10 } }],
  },
});
```

### Array quantifiers

Array flexible fields support `some`, `every`, and `none`:

```typescript
const results = await db.User.findMany({
  where: {
    locations: { some: { desk: 'A5' } },
  },
});
```

## Updates

### Merge update

Partial updates merge with existing data. Extra fields are preserved:

```typescript
await db.Customer.updateUnique({
  where: { id: customer.id },
  data: { billing: { city: 'SF' } },
});
// billing.street preserved, billing.floor preserved, city changed to SF
```

### Set (full replace)

Replaces the entire object. Old extra fields are removed:

```typescript
await db.Customer.updateUnique({
  where: { id: customer.id },
  data: { billing: { set: { street: 'New St', city: 'LA', newProp: true } } },
});
// old floor/buzzer gone, newProp added
```

### Array operations

```typescript
// Push with extra fields
await db.User.updateUnique({
  where: { id: user.id },
  data: { locations: { push: { street: 'New', city: 'LA', note: 'temp' } } },
});
```

## Restrictions

- `@flexible` can only be applied to fields with an object type (not scalars, relations, or arrays of scalars)
- Cannot be applied on the object definition itself — it is always per-field
- Select and OrderBy only support known fields (not extra fields)

## Migration Output

`@flexible` adds the `FLEXIBLE` keyword to the field's `DEFINE FIELD` statement while still emitting sub-field definitions for known fields:

```sql
DEFINE FIELD billing ON Customer FLEXIBLE TYPE object;
DEFINE FIELD billing.street ON Customer TYPE string;
DEFINE FIELD billing.city ON Customer TYPE string;
DEFINE FIELD billing.zip ON Customer TYPE option<string>;
```

Known field types are enforced by SurrealDB — `billing.street` must be a string. But `billing.custom` (or any other extra key) is allowed and stored without type constraints.
