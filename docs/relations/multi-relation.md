---
title: Multiple Relations
parent: Relations
nav_order: 6
---

# Multiple Relations Between the Same Models

When two models need more than one relation between them, use the `@key` decorator to pair each forward relation with its corresponding reverse relation.

## Schema Definition

```cerial
model Document {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer)
}

model Writer {
  id Record @id
  name String
  authoredDocs Relation[] @model(Document) @key(author)
  reviewedDocs Relation[] @model(Document) @key(reviewer)
}
```

## How `@key` Pairing Works

The `@key` value must match between a forward relation and its corresponding reverse relation:

- `Document.author` (`@key(author)`) pairs with `Writer.authoredDocs` (`@key(author)`)
- `Document.reviewer` (`@key(reviewer)`) pairs with `Writer.reviewedDocs` (`@key(reviewer)`)

Without `@key`, Cerial cannot determine which `Writer` reverse relation corresponds to which `Document` forward relation. The schema validator will raise an error if multiple relations exist between the same models without `@key` disambiguation.

## Usage

### Creating Documents

```typescript
// Create a document with author and reviewer
const doc = await db.Document.create({
  data: {
    title: 'RFC: New API Design',
    author: { connect: writer1Id },
    reviewer: { connect: writer2Id },
  },
});

// Create a document with only an author (reviewer is optional)
const draft = await db.Document.create({
  data: {
    title: 'Draft Proposal',
    author: { connect: writer1Id },
  },
});
```

### Querying from the Document Side

```typescript
const doc = await db.Document.findOne({
  where: { id: docId },
  include: {
    author: true,
    reviewer: true,
  },
});
// doc.author: Writer
// doc.reviewer: Writer | null
```

### Querying from the Writer Side

```typescript
const writer = await db.Writer.findOne({
  where: { id: writerId },
  include: {
    authoredDocs: true,
    reviewedDocs: true,
  },
});
// writer.authoredDocs: Document[]
// writer.reviewedDocs: Document[]
```

### Filtering

```typescript
// Find writers who authored at least one document
const activeAuthors = await db.Writer.findMany({
  where: {
    authoredDocs: { some: {} },
  },
});

// Find documents reviewed by a specific writer
const reviewed = await db.Document.findMany({
  where: { reviewerId: writerId },
});
```

## More Than Two Relations

You can define any number of relations between the same models. Each one needs a unique `@key` value.

```cerial
model Task {
  id Record @id
  title String
  creatorId Record
  creator Relation @field(creatorId) @model(TeamMember) @key(creator)
  assigneeId Record?
  assignee Relation? @field(assigneeId) @model(TeamMember) @key(assignee)
  reviewerIds Record[]
  reviewers Relation[] @field(reviewerIds) @model(TeamMember) @key(reviewers)
}

model TeamMember {
  id Record @id
  name String
  createdTasks Relation[] @model(Task) @key(creator)
  assignedTasks Relation[] @model(Task) @key(assignee)
  reviewingTasks Relation[] @model(Task) @key(reviewers)
}
```

```typescript
const task = await db.Task.create({
  data: {
    title: 'Implement feature X',
    creator: { connect: aliceId },
    assignee: { connect: bobId },
    reviewers: { connect: [charlieId, dianaId] },
  },
});

const member = await db.TeamMember.findOne({
  where: { id: aliceId },
  include: {
    createdTasks: true,
    assignedTasks: true,
    reviewingTasks: true,
  },
});
```

## Delete Behavior with Multiple Relations

Each relation can have its own `@onDelete` behavior:

```cerial
model Document {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Writer) @key(author)
  reviewerId Record?
  reviewer Relation? @field(reviewerId) @model(Writer) @key(reviewer) @onDelete(SetNull)
}
```

- Deleting a Writer who is an `author` of documents: cascades (required FK).
- Deleting a Writer who is a `reviewer` of documents: sets `reviewerId` to null (optional FK with SetNull).

See [Delete Behavior](on-delete.md) for all `@onDelete` options.
