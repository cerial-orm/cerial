---
name: gen-test
description: Generate tests following Cerial conventions (unit, e2e, typechecks)
disable-model-invocation: true
---

# Generate Test

Create tests for Cerial following project conventions.

## Arguments

- `<module>` - The module or file to generate tests for
- `--type <unit|e2e|typecheck>` - Test type (default: unit)

## Test Types

### Unit Tests (`tests/unit/<module>/*.test.ts`)

- No database required
- Test pure functions and transformations
- Mock external dependencies

### E2E Tests (`tests/e2e/relations/*.test.ts`)

- Require SurrealDB running at `http://127.0.0.1:8000`
- Use `--preload ./tests/e2e/preload.ts` when running
- Generated client lives in `tests/e2e/generated/`

### Type Checks (`tests/e2e/typechecks/*.check.ts`)

- Compile-time type verification using ts-toolbelt
- No runtime execution - verified by `bun run typecheck`

## Conventions

1. Reference existing tests in the same directory for patterns
2. Use descriptive `describe` and `it` blocks
3. Follow AAA pattern: Arrange, Act, Assert
4. For query tests, verify both the query string and parameters

## Example Unit Test Pattern

```typescript
import { describe, it, expect } from 'bun:test';

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle basic case', () => {
      // Arrange
      const input = {
        /* ... */
      };

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

## Example E2E Test Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { client } from '../generated';

describe('Feature E2E', () => {
  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should perform operation', async () => {
    const result = await client.db.Model.create({
      data: {
        /* ... */
      },
    });
    expect(result.id).toBeDefined();
  });
});
```
