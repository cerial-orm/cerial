# Unit Type Checks

This directory contains **compile-time type verification** files for core library types using [ts-toolbelt](https://millsp.github.io/ts-toolbelt/).

## How It Works

Files ending in `.check.ts` use `Test.check` and `Test.checks` from ts-toolbelt to verify core types at compile-time. These files are **NOT executed at runtime** - they are verified by running TypeScript's type checker.

## Usage

### Run Type Checks

```bash
bun run typecheck
```

This runs `tsc --noEmit` on all `.check.ts` files. If any type assertions fail, TypeScript will report an error.

## Files

- `metadata-types.check.ts` - Verifies ModelMetadata, FieldMetadata, RelationFieldMetadata types
- `common-types.check.ts` - Verifies Token, Lexeme, AST, and other common types

## Pattern

```typescript
Test.check<ActualType, ExpectedType, Test.Pass>()
```

- If `ActualType` equals `ExpectedType`, the check passes
- If they differ, TypeScript compilation fails with a type error
