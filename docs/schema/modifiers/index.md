---
title: Modifiers
parent: Schema
nav_order: 5
has_children: true
---

# Modifiers

Modifiers are field-level directives that control inheritance and field behavior in Cerial schemas. Unlike decorators (which use the `@` prefix), modifiers use special syntax and serve different purposes.

## Field Modifiers

| Modifier | Description | Applies To |
| --- | --- | --- |
| [`!!private`](private) | Prevent field override in child types | Model/object fields, tuple elements |

## Modifiers vs Decorators

- **Decorators** (`@`) — Modify field behavior, add constraints, or set defaults (e.g., `@unique`, `@default`, `@createdAt`)
- **Modifiers** (`!!`) — Control inheritance and field visibility (e.g., `!!private`)

Modifiers are placed at the end of a field line, after all decorators:

```cerial
abstract model Base {
  id Record @id !!private
  email Email @unique !!private
}
```

Currently, `!!private` is the only field modifier. More modifiers may be added in future versions.
