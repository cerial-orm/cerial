---
title: Select & Include
nav_order: 8
has_children: true
---

# Select & Include

Cerial uses a Prisma-style dynamic return type system. The return type of every query method changes based on the `select` and `include` options you pass — fully inferred at the TypeScript level with zero runtime overhead for type safety.

## Three Modes

### 1. No select/include — Full model type

When you call a query method without `select` or `include`, you get the full model type back:

```typescript
const user = await db.User.findOne({ where: { id } });
// user: User | null
```

All scalar fields, record ID fields, and embedded object fields are included. Virtual relation fields are **not** included unless explicitly requested via `include`.

### 2. With select — Narrowed field set

Pass a `select` object to pick exactly which fields you want. The return type narrows to only those fields:

```typescript
const user = await db.User.findOne({
  where: { id },
  select: { id: true, name: true },
});
// user: { id: CerialId; name: string } | null
```

Fields not mentioned in `select` are excluded from both the query result **and** the TypeScript type. Attempting to access an unselected field is a compile-time error.

### 3. With include — Model plus related records

Use `include` to load related records alongside the main model:

```typescript
const user = await db.User.findOne({
  where: { id },
  include: { profile: true, posts: true },
});
// user: (User & { profile: Profile; posts: Post[] }) | null
```

The return type is the full model intersected with the included relation types.

## How It Works

This type inference is powered by generated `GetModelPayload<S, I>` types that use TypeScript conditional types to compute the correct return type at compile time. For each model, Cerial generates:

- A **Select** type defining which fields can be selected
- An **Include** type defining which relations can be included
- A **GetPayload** type that resolves the final return type based on the `select` and `include` options provided

The generated types use `ResolveFieldSelect` for object sub-field narrowing and `ApplyObjectSelect` for recursive object type computation.

## In This Section

- [Select](select) — Pick specific fields from the main model
- [Object Sub-Select](object-sub-select) — Narrow embedded object fields to specific sub-fields
- [Include](include) — Load related records alongside the main model
- [Nested Includes](nested-includes) — Include relations of relations in a single query
- [Select + Include](select-plus-include) — Combine field selection with relation loading
