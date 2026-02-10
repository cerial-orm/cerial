---
title: Getting Started
nav_order: 2
---

# Getting Started

This guide walks you through installing Cerial, defining your first schema, generating the client, and running your first queries.

---

## Installation

```bash
bun add cerial
```

Cerial requires [Bun](https://bun.sh/) as the runtime and [SurrealDB](https://surrealdb.com/) as the database.

---

## 1. Define Your Schema

Create a directory for your schema files and add `.cerial` files. Each file can contain multiple `model` and `object` definitions.

**`schemas/schema.cerial`**:

```cerial
object Address {
  street String
  city String
  state String
  zipCode String?
}

model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool @default(true)
  createdAt Date @now
  address Address
  shipping Address?
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
  posts Relation[] @model(Post)
  nicknames String[]
}

model Profile {
  id Record @id
  bio String?
  userId Record?
  user Relation? @field(userId) @model(User) @onDelete(Cascade)
}

model Post {
  id Record @id
  title String
  content String?
  authorId Record
  author Relation @field(authorId) @model(User)
  createdAt Date @now
}

model Tag {
  id Record @id
  name String @unique
}
```

---

## 2. Generate the Client

Run the `generate` command to create your type-safe client:

```bash
bunx cerial generate -s ./schemas -o ./db-client
```

This reads all `.cerial` files from `./schemas` and generates a TypeScript client in `./db-client/`.

The generated output includes:

```
db-client/
├── client.ts             # CerialClient class
├── models/
│   ├── user.ts           # User interface + types
│   ├── profile.ts        # Profile interface + types
│   ├── post.ts           # Post interface + types
│   ├── tag.ts            # Tag interface + types
│   └── index.ts          # Model exports
├── internal/
│   ├── model-registry.ts # Runtime model metadata
│   ├── migrations.ts     # DEFINE TABLE/FIELD statements
│   └── index.ts
└── index.ts              # Main exports
```

---

## 3. Connect to SurrealDB

Import the generated client and connect to your SurrealDB instance:

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});
```

Migrations run automatically before the first query, creating all tables, fields, and indexes in SurrealDB.

---

## 4. Create Records

```typescript
// Create a user with an embedded object
const user = await client.db.User.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    isActive: true,
    address: { street: '123 Main St', city: 'NYC', state: 'NY' },
    nicknames: ['Johnny', 'JD'],
  },
});
// user.id is a CerialId object
// user.createdAt is auto-set by @now
// user.isActive defaults to true via @default(true)
```

---

## 5. Query Records

```typescript
// Find many with filtering, selection, and pagination
const users = await client.db.User.findMany({
  where: { isActive: true },
  select: { id: true, name: true, email: true },
  limit: 10,
});
// users: { id: CerialId; name: string; email: string }[]

// Find one with related records
const userWithPosts = await client.db.User.findOne({
  where: { id: user.id },
  include: {
    profile: true,
    posts: { limit: 5, orderBy: { createdAt: 'desc' } },
  },
});
// userWithPosts: User & { profile: Profile; posts: Post[] } | null

// Select with object sub-fields (type-safe narrowing)
const usersWithCity = await client.db.User.findMany({
  select: { name: true, address: { city: true } },
});
// usersWithCity: { name: string; address: { city: string } }[]
```

---

## 6. Update Records

```typescript
// Update many records
await client.db.User.updateMany({
  where: { isActive: false },
  data: { isActive: true },
});

// Update with array operations
await client.db.User.updateMany({
  where: { id: user.id },
  data: {
    nicknames: { push: 'John' },
  },
});

// Update a single record by unique field
const updated = await client.db.User.updateUnique({
  where: { id: user.id },
  data: { name: 'John Smith' },
});
```

---

## 7. Delete Records

```typescript
// Delete many records
const count = await client.db.User.deleteMany({
  where: { isActive: false },
});
// count: number

// Delete a single record
const deleted = await client.db.User.deleteUnique({
  where: { id: user.id },
  return: 'before',
});
// deleted: User | null (the data before deletion)
```

---

## 8. Disconnect

```typescript
await client.disconnect();
```

---

## Next Steps

- [Schema Definition Language](schema/) - Learn the full schema syntax
- [Queries](queries/) - Explore all query methods
- [Relations](relations/) - Set up relations between models
- [Filtering](filtering/) - Master the filter operators
- [Type System](types/) - Understand CerialId and type inference
