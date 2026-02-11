---
title: Connecting
parent: Connection
nav_order: 1
---

# Connecting

This page covers how to establish and manage connections between your application and SurrealDB using the `CerialClient`.

## Basic Connection

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Ready to query
const users = await client.db.User.findMany();
```

The `connect()` method establishes a WebSocket connection to SurrealDB, authenticates with the provided credentials, and selects the namespace and database.

## Connection Options

| Option      | Type                                     | Description                              |
| ----------- | ---------------------------------------- | ---------------------------------------- |
| `url`       | `string`                                 | SurrealDB server URL (HTTP or WebSocket) |
| `namespace` | `string`                                 | SurrealDB namespace to use               |
| `database`  | `string`                                 | SurrealDB database within the namespace  |
| `auth`      | `{ username: string; password: string }` | Authentication credentials               |

### URL Format

The `url` option accepts both HTTP and WebSocket URLs. The SurrealDB JavaScript SDK handles the protocol upgrade internally:

```typescript
// HTTP - SDK upgrades to WebSocket automatically
await client.connect({ url: 'http://localhost:8000', ... });

// HTTPS for production
await client.connect({ url: 'https://db.example.com', ... });
```

### Namespace and Database

SurrealDB organizes data in a hierarchy: **namespace** > **database** > **table**. You must specify both a namespace and database when connecting:

```typescript
await client.connect({
  url: 'http://localhost:8000',
  namespace: 'production',
  database: 'myapp',
  auth: { username: 'root', password: 'root' },
});
```

### Authentication

Currently, Cerial supports root-level authentication with username and password:

```typescript
await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: {
    username: 'root',
    password: 'root',
  },
});
```

## Disconnecting

Always disconnect when you're done to cleanly close the WebSocket connection:

```typescript
await client.disconnect();
```

This is especially important in:

- **Server shutdown hooks** - Ensure connections are closed on process exit
- **Test teardown** - Clean up after each test or test suite
- **Serverless functions** - Close connections before the function completes

```typescript
// Express/Koa shutdown example
process.on('SIGTERM', async () => {
  await client.disconnect();
  process.exit(0);
});

// Test teardown example
afterAll(async () => {
  await client.disconnect();
});
```

## Named Connections

You can manage multiple connections by providing a name to `connect()` and `disconnect()`:

```typescript
// Connect to multiple databases
await client.connect(
  {
    url: 'http://localhost:8000',
    namespace: 'main',
    database: 'primary',
    auth: { username: 'root', password: 'root' },
  },
  'primary',
);

await client.connect(
  {
    url: 'http://localhost:8000',
    namespace: 'main',
    database: 'analytics',
    auth: { username: 'root', password: 'root' },
  },
  'secondary',
);

// Disconnect a specific connection
await client.disconnect('secondary');

// Disconnect all connections
await client.disconnectAll();
```

This is useful when your application needs to read from or write to multiple databases.

## Accessing the Raw Surreal Instance

If you need to perform operations that Cerial doesn't cover, you can access the underlying SurrealDB SDK instance directly:

```typescript
const surreal = client.getSurreal();

// Run raw SurrealQL queries
const result = await surreal.query('SELECT * FROM user WHERE age > $age', { age: 25 });

// Use any SurrealDB SDK method
await surreal.let('currentUser', userId);
```

This is an escape hatch for advanced use cases. Prefer using the typed `client.db` proxy for normal operations, as it provides type safety and handles record ID transformations automatically.

## Connection Patterns

### Application Singleton

For most applications, create a single client instance and share it:

```typescript
// db.ts
import { CerialClient } from './db-client';

export const client = new CerialClient();

export async function initDatabase() {
  await client.connect({
    url: process.env.SURREAL_URL ?? 'http://localhost:8000',
    namespace: process.env.SURREAL_NS ?? 'main',
    database: process.env.SURREAL_DB ?? 'main',
    auth: {
      username: process.env.SURREAL_USER ?? 'root',
      password: process.env.SURREAL_PASS ?? 'root',
    },
  });
}

// app.ts
import { client, initDatabase } from './db';

await initDatabase();

const users = await client.db.User.findMany();
```

### Test Setup

For tests, connect in a setup hook and disconnect in teardown:

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

beforeAll(async () => {
  await client.connect({
    url: 'http://127.0.0.1:8000',
    namespace: 'main',
    database: 'main',
    auth: { username: 'root', password: 'root' },
  });
});

afterAll(async () => {
  await client.disconnect();
});

test('creates a user', async () => {
  const user = await client.db.User.create({
    data: { name: 'Alice', email: 'alice@example.com' },
  });
  expect(user.name).toBe('Alice');
});
```

### Atomic Transactions

Use `$transaction` to execute multiple queries atomically:

```typescript
const [user, profile] = await client.$transaction([
  client.db.User.create({
    data: { name: 'Alice', email: 'alice@example.com' },
  }),
  client.db.Profile.create({
    data: { bio: 'Hello world', userId: existingUserId },
  }),
]);
// Both created atomically — if either fails, neither is committed
```

See [`$transaction`](../queries/transaction.md) for full documentation.

### Environment-Based Configuration

Use environment variables to configure connections per environment:

```typescript
const config = {
  url: process.env.SURREAL_URL!,
  namespace: process.env.SURREAL_NS!,
  database: process.env.SURREAL_DB!,
  auth: {
    username: process.env.SURREAL_USER!,
    password: process.env.SURREAL_PASS!,
  },
};

await client.connect(config);
```
