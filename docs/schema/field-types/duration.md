---
title: Duration
parent: Field Types
grand_parent: Schema
nav_order: 10
---

# Duration

A time duration stored as SurrealDB's native `duration` type. Output is a `CerialDuration` instance; input accepts `CerialDurationInput` (string, `CerialDuration`, or SDK `Duration`).

## Schema Syntax

```cerial
model Task {
  id Record @id
  ttl Duration
  timeout Duration?
  cooldown Duration @nullable
  intervals Duration[]
}
```

## Types

| Direction | Type                                                         |
| --------- | ------------------------------------------------------------ |
| Output    | `CerialDuration`                                             |
| Input     | `CerialDurationInput` (string \| CerialDuration \| Duration) |
| SurrealDB | `duration`                                                   |

## Duration String Format

Duration strings use SurrealDB's duration syntax — one or more unit segments concatenated:

| Unit         | Suffix      | Example |
| ------------ | ----------- | ------- |
| Years        | `y`         | `1y`    |
| Weeks        | `w`         | `2w`    |
| Days         | `d`         | `3d`    |
| Hours        | `h`         | `12h`   |
| Minutes      | `m`         | `30m`   |
| Seconds      | `s`         | `45s`   |
| Milliseconds | `ms`        | `500ms` |
| Microseconds | `us` / `µs` | `100us` |
| Nanoseconds  | `ns`        | `250ns` |

Compound durations: `1h30m`, `2d12h`, `1w3d2h30m15s`

{: .note }
SurrealDB normalizes durations — for example, `7d` becomes `1w`, and `24h` becomes `1d`.

## CerialDuration API

```typescript
import { CerialDuration } from 'cerial';

// Create from string
const dur = new CerialDuration('2h30m');

// Static constructors
CerialDuration.from(input); // from CerialDurationInput
CerialDuration.parse(input); // alias for from()

// Accessors (total in each unit)
dur.years; // number
dur.weeks; // number
dur.days; // number
dur.hours; // number — e.g., 2 for '2h30m'
dur.minutes; // number — e.g., 150 for '2h30m'
dur.seconds; // number
dur.milliseconds; // number
dur.microseconds; // number
dur.nanoseconds; // number

// Serialization
dur.toString(); // '2h30m'
dur.toJSON(); // same as toString()
dur.valueOf(); // milliseconds as number

// Comparison
dur.equals(other); // compare with CerialDurationInput
dur.compareTo(other); // negative/zero/positive

// SDK interop
dur.toNative(); // SDK Duration instance
dur.clone(); // new CerialDuration copy

// Type guard
CerialDuration.is(value); // value is CerialDuration
```

## Usage

```typescript
// Create with string
const task = await db.Task.create({
  data: { ttl: '2h30m', cooldown: null },
});

// Create with CerialDuration
const task2 = await db.Task.create({
  data: { ttl: CerialDuration.from('1h15m'), cooldown: '5m' },
});

// Output is CerialDuration
console.log(task.ttl); // CerialDuration instance
console.log(task.ttl.toString()); // '2h30m'
console.log(task.ttl.hours); // 2
console.log(task.ttl.minutes); // 150
```

## Filtering

Duration fields support comparison, set, and range operators:

```typescript
// Direct equality
const tasks = await db.Task.findMany({
  where: { ttl: '2h' },
});

// Comparison operators
const longTasks = await db.Task.findMany({
  where: { ttl: { gt: '1h', lte: '24h' } },
});

// Set operators
const specific = await db.Task.findMany({
  where: { ttl: { in: ['30m', '1h', '2h'] } },
});

// Range
const midRange = await db.Task.findMany({
  where: { ttl: { between: ['1h', '12h'] } },
});
```

## Array Operations

```typescript
// Create with duration array
const task = await db.Task.create({
  data: { ttl: '1h', cooldown: null, intervals: ['10s', '30s', '1m'] },
});

// Push to array
await db.Task.updateUnique({
  where: { id: task.id },
  data: { intervals: { push: '5m' } },
});

// Full replace
await db.Task.updateUnique({
  where: { id: task.id },
  data: { intervals: ['1h', '2h'] },
});
```

## Decorators

Duration fields support `@default` and `@defaultAlways`:

```cerial
model Config {
  id Record @id
  name String
  ttl Duration @default(1h)
  resetInterval Duration @defaultAlways(30m)
}
```

`@default(1h)` sets the value on create when the field is absent. `@defaultAlways(30m)` resets the value on every create/update when absent.
