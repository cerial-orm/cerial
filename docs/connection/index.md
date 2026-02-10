---
title: Connection
nav_order: 12
has_children: true
---

# Connection

The `CerialClient` is the entry point for all database operations. It manages connections to SurrealDB and provides typed model access through a proxy.

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();

await client.connect({
  url: 'http://localhost:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
});

// Access models via the typed db proxy
const users = await client.db.User.findMany();
const post = await client.db.Post.create({
  data: { title: 'Hello World', authorId: users[0].id },
});

await client.disconnect();
```

## How It Works

The client uses the JavaScript [Proxy API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) to dynamically intercept model access. When you write `client.db.User`, the proxy:

1. Looks up `"User"` in the model registry
2. Creates a model accessor bound to that model's metadata
3. Returns an object with query methods (`findOne`, `findMany`, `create`, `updateUnique`, `deleteUnique`, etc.)

This means every model defined in your schema is automatically available on `client.db` with full type safety - no manual registration required.

```typescript
// All of these are fully typed based on your schema
client.db.User; // → Model accessor for User
client.db.Post; // → Model accessor for Post
client.db.Profile; // → Model accessor for Profile
client.db.Tag; // → Model accessor for Tag
```

TypeScript knows the exact shape of each model accessor, so you get autocomplete for model names, method names, and all argument types.

## Client Lifecycle

```
new CerialClient()  →  connect()  →  migrate()  →  query  →  disconnect()
                                      (auto)
```

1. **Instantiate** - Create a new `CerialClient` instance
2. **Connect** - Establish a connection to SurrealDB with credentials
3. **Migrate** - Schema migrations run automatically before the first query (or call `migrate()` explicitly)
4. **Query** - Use `client.db.<Model>` to perform CRUD operations
5. **Disconnect** - Close the connection when done

## Next Steps

- [**Connecting**](./connecting) - Connection setup, configuration, and multi-connection support
- [**Migrations**](./migrations) - How schema migrations work and when they run
