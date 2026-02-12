---
title: Cross-File References
parent: Schema
nav_order: 6
---

# Cross-File References

Cerial schemas can span multiple `.cerial` files. When you point the generator at a directory, all `.cerial` files in that directory are parsed together as a single schema scope.

## How It Works

When you run the generator with a schema directory:

```bash
cerial generate -s ./schemas
```

All `.cerial` files in the `./schemas` directory are loaded and parsed as one combined schema. This means:

- **Object types** defined in one file can be referenced as field types in any other file.
- **Models** defined in one file can be referenced in relation decorators in any other file.
- **All files share the same namespace** — duplicate model or object names across files are not allowed.

## Example

```cerial
# schemas/types.cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

object GeoPoint {
  lat Float
  lng Float
  label String?
}
```

```cerial
# schemas/user.cerial
model User {
  id Record @id
  name String
  email Email @unique
  address Address           # References object from types.cerial
  createdAt Date @createdAt
  posts Relation[] @model(Post)
}
```

```cerial
# schemas/post.cerial
model Post {
  id Record @id
  title String
  content String
  location GeoPoint?        # References object from types.cerial
  authorId Record
  author Relation @field(authorId) @model(User)   # References model from user.cerial
  tags Relation[] @model(Tag)
}

model Tag {
  id Record @id
  name String @unique
  postIds Record[]
  posts Relation[] @model(Post)
}
```

All three files are parsed together. `Post` can reference `User` and `GeoPoint` even though they are defined in different files.

## Rules

- **No duplicate names** — Each model and object name must be unique across all files. Defining `model User` in two different files will cause an error.
- **Order doesn't matter** — Files are all loaded before resolution, so forward references work. A file can reference a model or object that is defined in a file loaded later.
- **Flat directory** — Only files directly in the specified directory are included. Subdirectories are not recursively scanned.

## Best Practices

- **Organize by domain** — Group related models in the same file (e.g., `user.cerial` for User and Profile, `blog.cerial` for Post, Comment, and Tag).
- **Shared objects in a common file** — Put reusable embedded types like `Address`, `GeoPoint`, or `Money` in a `types.cerial` or `common.cerial` file.
- **Keep related models together** — If two models are tightly coupled (e.g., `Order` and `OrderItem`), define them in the same file for readability.
- **Use comments as section headers** — Within larger files, use comment blocks to separate logical sections.

```
schemas/
├── types.cerial       # Shared object types (Address, GeoPoint, etc.)
├── user.cerial        # User, Profile
├── blog.cerial        # Post, Comment, Tag
└── commerce.cerial    # Product, Order, OrderItem
```
