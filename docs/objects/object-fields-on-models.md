---
title: Object Fields on Models
parent: Objects
nav_order: 2
---

# Object Fields on Models

Once you have defined an object type, you can use it as a field on any model. There are three patterns: required, optional, and array.

## Required Object Field

```cerial
model User {
  id Record @id
  address Address          # Required - must be provided on create
}
```

**TypeScript type:** `address: Address`

A required object field must be provided whenever a record is created. All required fields within the object must also be supplied.

## Optional Object Field

```cerial
model User {
  id Record @id
  shipping Address?        # Optional - can be omitted
}
```

**TypeScript type:** `shipping?: Address`

An optional object field can be omitted entirely on create. When omitted, it is stored as `NONE` (field absent) in SurrealDB.

{: .important }

> Optional object fields produce `field?: ObjectType` — there is **no** `| null` in the type, unlike optional primitive fields which produce `field?: string | null`. This is because embedded objects are either present or absent, not null.

## Array of Objects

```cerial
model User {
  id Record @id
  locations GeoPoint[]     # Array of embedded objects
}
```

**TypeScript type:** `locations: GeoPoint[]`

Array object fields hold zero or more embedded objects. If omitted on create, the field defaults to an empty array `[]`.

## Create Examples

### Required object — all required sub-fields must be provided

```typescript
const user = await db.User.create({
  data: {
    address: { street: '123 Main', city: 'NYC', state: 'NY' },
  },
});
// user.address is { street: '123 Main', city: 'NYC', state: 'NY' }
```

### Optional object — can be omitted entirely

```typescript
const user = await db.User.create({
  data: {
    address: { street: '123 Main', city: 'NYC', state: 'NY' },
    // shipping is omitted - stored as NONE in SurrealDB
  },
});
// user.shipping is undefined
```

### Array of objects — can omit (defaults to []) or provide values

```typescript
const user = await db.User.create({
  data: {
    address: { street: '123 Main', city: 'NYC', state: 'NY' },
    locations: [
      { lat: 40.7, lng: -74.0 },
      { lat: 34.0, lng: -118.2 },
    ],
  },
});
// user.locations is [{ lat: 40.7, lng: -74.0 }, { lat: 34.0, lng: -118.2 }]
```

```typescript
// Omitting the array field — defaults to []
const user = await db.User.create({
  data: {
    address: { street: '123 Main', city: 'NYC', state: 'NY' },
    // locations omitted - defaults to []
  },
});
// user.locations is []
```
