---
title: Dynamic Return Types
parent: Type System
nav_order: 4
---

# Dynamic Return Types

Cerial's most powerful type-level feature is dynamic return types — the TypeScript type of your query result changes based on the `select` and `include` options you provide. This gives you full IntelliSense and compile-time safety: if you try to access a field you didn't select, TypeScript gives you an error.

## How It Works

For each model, Cerial generates a `GetModelPayload<S, I>` type where:

- `S` is the `select` option type (which fields to return)
- `I` is the `include` option type (which relations to load)

This type uses TypeScript conditional types to compute the exact return type:

```typescript
// Simplified concept:
type GetUserPayload<S, I> = S extends UserSelect
  ? { [K in SelectedKeys<S>]: ResolveFieldType<User[K], S[K]> }
  : User & (I extends UserInclude ? GetUserIncludePayload<I> : {});
```

When `S` is `undefined` (no select), you get the full model type. When `S` is a specific select object, you get only the fields where the value is `true` (or a sub-select object). Include types are intersected to add relation data.

## Key Utility Types

| Type                                         | Purpose                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetModelPayload<S, I>`                      | Main return type resolver. Combines selected fields with included relations.                                                                              |
| `ResolveFieldSelect<FieldType, SelectValue>` | Resolves a single field's type based on its select value. `true` returns the full field type; an object applies sub-field selection for embedded objects. |
| `ApplyObjectSelect<T, S>`                    | Recursively applies sub-field selection to an object type, producing a narrowed type with only the selected sub-fields.                                   |
| `SelectedKeys<T>`                            | Extracts keys from a select object where the value is not `false` or `undefined`.                                                                         |
| `GetIncludePayload<M, R, I>`                 | Computes the type for included relations, respecting cardinality (single vs array) and nested options.                                                    |

## Examples

### No Select — Full Model

When you don't pass a `select` option, you get the full model type:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
});
// Type: User
// Resolves to: GetUserPayload<undefined, undefined>

user.id; // CerialId ✓
user.email; // string ✓
user.name; // string ✓
user.age; // number | null | undefined ✓
user.createdAt; // Date ✓
```

### Select Specific Fields

When you pass `select`, only the selected fields appear in the return type:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, name: true },
});
// Type: { id: CerialId; name: string }
// Resolves to: GetUserPayload<{ id: true; name: true }, undefined>

user.id; // CerialId ✓
user.name; // string ✓
user.email; // TypeScript error! Property 'email' does not exist
```

### Include Relations

When you pass `include`, relation data is added to the model type:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  include: { posts: true },
});
// Type: User & { posts: Post[] }
// Resolves to: GetUserPayload<undefined, { posts: true }>

user.id; // CerialId ✓
user.name; // string ✓
user.posts; // Post[] ✓
```

### Include with Nested Options

Included relations can have their own `where`, `select`, `orderBy`, `limit`, and `offset`:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      limit: 5,
    },
  },
});
// Type: User & { posts: Post[] }
// The where/orderBy/take filter at runtime but don't change the type
```

### Select + Include Combined

You can use both `select` and `include` together:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { id: true, name: true },
  include: { posts: true },
});
// Type: { id: CerialId; name: string } & { posts: Post[] }

user.id; // CerialId ✓
user.name; // string ✓
user.posts; // Post[] ✓
user.email; // TypeScript error!
```

### Object Sub-Field Selection

Embedded object fields support sub-field selection for type narrowing:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { address: { city: true, state: true } },
});
// Type: { address: { city: string; state: string } }
// Resolves via:
//   ResolveFieldSelect<Address, { city: true; state: true }>
//   → ApplyObjectSelect<Address, { city: true; state: true }>
//   → { city: string; state: string }

user.address.city; // string ✓
user.address.state; // string ✓
user.address.street; // TypeScript error!
```

Compare with selecting the full object:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { address: true },
});
// Type: { address: Address }
// ResolveFieldSelect<Address, true> → Address (full type)

user.address.city; // string ✓
user.address.street; // string ✓ (all fields available)
```

### Optional Object Sub-Field Selection

Optional object fields preserve their optionality through sub-field selection:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { shipping: { city: true } },
});
// Type: { shipping?: { city: string } }
// The `?` is preserved — shipping may not exist

if (user.shipping) {
  user.shipping.city; // string ✓
}
```

### Array Object Sub-Field Selection

Array-of-object fields apply sub-field selection to each element:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  select: { locations: { lat: true, lng: true } },
});
// Type: { locations: { lat: number; lng: number }[] }

user.locations[0].lat; // number ✓
user.locations[0].lng; // number ✓
```

## Select Within Include

You can use `select` inside an `include` option to narrow relation types:

```typescript
const user = await db.User.findOne({
  where: { id: '123' },
  include: {
    posts: {
      select: { id: true, title: true },
    },
  },
});
// Type: User & { posts: { id: CerialId; title: string }[] }

user.posts[0].title; // string ✓
user.posts[0].content; // TypeScript error!
```

{: .note }

> The `select` within `include` is **type-level narrowing only**. At runtime, SurrealDB returns full related objects. The type narrowing ensures your code only accesses the fields you've declared interest in, but the actual data may contain more fields.

## How findMany Differs

The `findMany` method returns an array, and the same type resolution applies to each element:

```typescript
const users = await db.User.findMany({
  where: { isActive: true },
  select: { id: true, name: true },
});
// Type: { id: CerialId; name: string }[]

users[0].id; // CerialId ✓
users[0].email; // TypeScript error!
```

## Type Resolution Summary

| Query Options                                  | Return Type                             |
| ---------------------------------------------- | --------------------------------------- |
| No select, no include                          | `Model`                                 |
| `select: { a: true, b: true }`                 | `{ a: TypeOfA; b: TypeOfB }`            |
| `include: { rel: true }`                       | `Model & { rel: RelatedType }`          |
| `select: { a: true } + include: { rel: true }` | `{ a: TypeOfA } & { rel: RelatedType }` |
| `select: { obj: { sub: true } }`               | `{ obj: { sub: TypeOfSub } }`           |
| `select: { obj: true }`                        | `{ obj: FullObjectType }`               |
| `include: { rel: { select: { a: true } } }`    | `Model & { rel: { a: TypeOfA } }`       |
