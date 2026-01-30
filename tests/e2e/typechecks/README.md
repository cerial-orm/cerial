# Type Checks

This directory contains **compile-time type verification** files using [ts-toolbelt](https://millsp.github.io/ts-toolbelt/).

## How It Works

Files ending in `.check.ts` use `Test.check` and `Test.checks` from ts-toolbelt to verify generated types at compile-time. These files are **NOT executed at runtime** - they are verified by running TypeScript's type checker.

## Usage

### Run Type Checks

```bash
bun run typecheck
```

This runs `tsc --noEmit` on all `.check.ts` files. If any type assertions fail, TypeScript will report an error.

### Writing Type Checks

```typescript
import { Test } from 'ts-toolbelt';
import type { User, GetUserPayload } from '../generated';

// Verify field types
Test.checks([
  Test.check<User['id'], string, Test.Pass>(),
  Test.check<User['email'], string, Test.Pass>(),
]);

// Verify type inference
type Result = GetUserPayload<{ id: true }>;
Test.checks([
  Test.check<Result['id'], string, Test.Pass>(),
]);

// Verify type extension
type Extends<A, B> = A extends B ? 1 : 0;
Test.checks([
  Test.check<Extends<{ name: string }, User>, 0, Test.Pass>(), // doesn't extend
]);
```

### Pattern

```typescript
Test.check<ActualType, ExpectedType, Test.Pass>()
```

- If `ActualType` equals `ExpectedType`, the check passes
- If they differ, TypeScript compilation fails with a type error

## Files

- `generated-types.check.ts` - Verifies model interfaces (User, Profile, etc.) and operation types (UserCreate, UserWhere, etc.)
- `payload-inference.check.ts` - Verifies GetPayload type inference for select/include operations

## Why Not Runtime Tests?

ts-toolbelt's `Test.check` returns a type-level result (`1` for pass), not a runtime value. Attempting to execute these files would fail because:

1. The functions are type-level only
2. Bun/Node cannot execute pure type operations

By using `tsc --noEmit`, we get:
- **Compile-time verification** - Errors caught before runtime
- **Zero runtime overhead** - No test execution needed
- **Better error messages** - TypeScript shows exactly which type doesn't match
