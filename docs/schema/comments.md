---
title: Comments
parent: Schema
nav_order: 5
---

# Comments

Comments in `.cerial` files use the `#` character. Everything from `#` to the end of the line is ignored by the parser.

## Syntax

```cerial
# This is a full-line comment

model User {
  id Record @id
  email Email @unique    # This is an inline comment
  name String
  # age Int?             # Commented-out field
}
```

## Usage

Comments can appear anywhere in a `.cerial` file:

- **Before a model or object** — Describe the purpose of the type.
- **After a field declaration** — Explain a specific field's role.
- **On their own line** — Add notes, TODOs, or section separators.
- **Commenting out fields** — Temporarily disable a field without removing it.

```cerial
# ==========================================
# User domain models
# ==========================================

# The main user account model.
# Users authenticate via email and can have a profile.
model User {
  id Record @id
  email Email @unique      # Login identifier
  name String              # Display name
  bio String? @default(null)
  createdAt Date @createdAt

  # Relations
  profileId Record?
  profile Relation? @field(profileId) @model(Profile)
  posts Relation[] @model(Post)
}

# User profile with extended information
object Address {
  street String
  city String
  # state String          # TODO: add state field
  zipCode String?
}
```
