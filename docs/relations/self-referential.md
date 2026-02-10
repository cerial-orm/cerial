---
title: Self-Referential
parent: Relations
nav_order: 4
---

# Self-Referential Relations

Self-referential relations allow a model to reference itself. These are useful for tree structures, social graphs, organizational hierarchies, and other recursive data patterns.

## Tree Structure (1:N Self-Reference)

A common pattern for categories, comments, or org charts where each record has an optional parent and multiple children.

```cerial
model Category {
  id Record @id
  name String
  parentId Record?
  parent Relation? @field(parentId) @model(Category) @key(hierarchy)
  children Relation[] @model(Category) @key(hierarchy)
}
```

The `@key(hierarchy)` decorator is **required** here. Without it, Cerial cannot determine which reverse relation (`children`) corresponds to which forward relation (`parent`), since both point to the same model.

### Usage

```typescript
// Create a root category
const root = await db.Category.create({
  data: { name: 'Electronics' },
});

// Create child categories
const phones = await db.Category.create({
  data: {
    name: 'Phones',
    parent: { connect: root.id },
  },
});

const laptops = await db.Category.create({
  data: {
    name: 'Laptops',
    parent: { connect: root.id },
  },
});

// Create with nested children
const books = await db.Category.create({
  data: {
    name: 'Books',
    children: {
      create: [{ name: 'Fiction' }, { name: 'Non-Fiction' }],
    },
  },
});

// Query a category with its children
const category = await db.Category.findOne({
  where: { id: root.id },
  include: { children: true },
});
// category.children: Category[]

// Query a category with its parent
const child = await db.Category.findOne({
  where: { id: phones.id },
  include: { parent: true },
});
// child.parent: Category | null
```

## Self-Referential 1:1 (One-Directional)

When you only need to reference another record of the same type without a reverse lookup.

```cerial
model Employee {
  id Record @id
  name String
  mentorId Record?
  mentor Relation? @field(mentorId) @model(Employee)
}
```

No `@key` is needed here because there is no reverse relation to disambiguate.

### Usage

```typescript
const senior = await db.Employee.create({
  data: { name: 'Alice' },
});

const junior = await db.Employee.create({
  data: {
    name: 'Bob',
    mentor: { connect: senior.id },
  },
});

const employee = await db.Employee.findOne({
  where: { id: junior.id },
  include: { mentor: true },
});
// employee.mentor: Employee | null
```

## Self-Referential 1:1 with Reverse (Bidirectional)

When you need both directions of a 1:1 self-reference, use `@key` to pair the forward and reverse sides.

```cerial
model Employee {
  id Record @id
  name String
  mentorId Record?
  mentor Relation? @field(mentorId) @model(Employee) @key(mentorship)
  mentee Relation? @model(Employee) @key(mentorship)
}
```

### Usage

```typescript
const mentor = await db.Employee.create({
  data: { name: 'Alice' },
});

const mentee = await db.Employee.create({
  data: {
    name: 'Bob',
    mentor: { connect: mentor.id },
  },
});

// Query from mentor side
const alice = await db.Employee.findOne({
  where: { id: mentor.id },
  include: { mentee: true },
});
// alice.mentee: Employee | null

// Query from mentee side
const bob = await db.Employee.findOne({
  where: { id: mentee.id },
  include: { mentor: true },
});
// bob.mentor: Employee | null
```

## Following Pattern (Single-Sided N:N)

A social media "following" pattern where one side stores the array of IDs but the reverse is not explicitly defined. This is a single-sided N:N — you track who you follow, but not who follows you via a dedicated field.

```cerial
model SocialUser {
  id Record @id
  name String
  followingIds Record[]
  following Relation[] @field(followingIds) @model(SocialUser)
}
```

### Usage

```typescript
const alice = await db.SocialUser.create({
  data: { name: 'Alice' },
});

const bob = await db.SocialUser.create({
  data: {
    name: 'Bob',
    following: { connect: [alice.id] },
  },
});

// Query who Bob follows
const bobWithFollowing = await db.SocialUser.findOne({
  where: { id: bob.id },
  include: { following: true },
});
// bobWithFollowing.following: SocialUser[]

// To find followers of Alice, query the FK directly
const followers = await db.SocialUser.findMany({
  where: { followingIds: { has: alice.id } },
});
```

## Symmetric N:N (Friends Pattern)

A friends list where the relationship is mutual. Each person stores their own list of friend IDs.

```cerial
model Person {
  id Record @id
  name String
  friendIds Record[]
  friends Relation[] @field(friendIds) @model(Person)
}
```

Since both sides of the N:N point to the same model, Cerial handles bidirectional sync automatically — adding person A as a friend of person B also adds person B as a friend of person A.

### Usage

```typescript
const alice = await db.Person.create({
  data: { name: 'Alice' },
});

const bob = await db.Person.create({
  data: {
    name: 'Bob',
    friends: { connect: [alice.id] },
  },
});
// Bob.friendIds = [alice.id]
// Alice.friendIds += [bob.id]  (automatic sync)

// Query friends
const person = await db.Person.findOne({
  where: { id: alice.id },
  include: { friends: true },
});
// person.friends: Person[] — includes Bob
```

## When is `@key` Required?

`@key` is required whenever a model has **multiple relations pointing to itself** and you need to define reverse relations. Without `@key`, Cerial cannot determine which reverse relation corresponds to which forward relation.

| Scenario                              | `@key` Required?                                          |
| ------------------------------------- | --------------------------------------------------------- |
| Single forward, no reverse            | No                                                        |
| Single forward + single reverse       | Yes (only one possible pairing, but `@key` disambiguates) |
| Multiple forwards + multiple reverses | Yes (mandatory for correct pairing)                       |
| N:N self-reference (symmetric)        | No (single relation, auto-syncs with itself)              |
