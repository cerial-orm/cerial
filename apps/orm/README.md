# Cerial

A Prisma-like ORM for SurrealDB with schema-driven code generation and full TypeScript type safety.

## Features

- Schema-first design with `.cerial` files
- 15 field types: String, Int, Float, Bool, Date, Email, Uuid, Duration, Decimal, Bytes, Geometry, Number, Any, Record, Relation
- Embedded objects, tuples, literals, and enums
- Full relation support (1:1, 1:N, N:N) with nested create, connect, and disconnect
- Complete CRUD query API with type-safe select and include
- Rich filtering: comparison, string, array, logical, and existence operators
- Transactions in three modes: array, callback, and manual
- Schema inheritance with `extends`, `abstract` models, and pick/omit
- Auto-generated TypeScript types with dynamic return types
- CLI with generate, init, format commands and watch mode
- Auto-migration generation (DEFINE TABLE/FIELD/INDEX)
- Clean NONE vs null separation (`?` for optional, `@nullable` for null)
- Typed record IDs with automatic FK type inference

## Installation

```bash
npm install cerial    # or: pnpm add cerial / yarn add cerial / bun add cerial
```

## Quick Start

**1. Define your schema** in a `.cerial` file:

```
model User {
  id    Record @id
  email Email  @unique
  name  String
  age   Int?
}
```

**2. Generate the client:**

```bash
npx cerial generate -s ./schemas -o ./db-client
```

**3. Query with full type safety:**

```typescript
import { CerialClient } from './db-client';

const client = new CerialClient();
await client.connect({ url: 'http://localhost:8000', namespace: 'main', database: 'main' });

const users = await client.User.findMany({
  where: { age: { gte: 18 } },
  select: { id: true, name: true, email: true },
});
```

## Links

- [Documentation](https://cerial-orm.github.io)
- [GitHub](https://github.com/cerial-orm/cerial)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=cerial.cerial)

## License

Apache 2.0
