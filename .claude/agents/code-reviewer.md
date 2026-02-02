# Code Reviewer

A specialized reviewer for Cerial codebase changes.

## Focus Areas

### 1. Query Correctness
- Parameterized queries MUST use `$varName` binding, not inline values
- Connect operations: `profileId = $profile_connect[0]` (not `profileId = "profile:123"`)
- Array operations: `tagIds = $tags_connect` (not `tagIds = ["tag:1"]`)
- Bidirectional sync: `UPDATE $sync_0_0 SET userIds += $resultId`

### 2. NONE vs null Semantics
- `field String?` without `@default(null)`: undefined → NONE, null → null stored
- `field String? @default(null)`: undefined → null stored
- `field Record?`: null is treated as NONE (record refs can't be null)
- Disconnect: `SET fieldName = NULL` (queryable)
- Delete field: `SET fieldName = NONE` (field absent)

### 3. RecordId Transformation
- API exposes plain IDs (e.g., `'abc123'`)
- Internal queries use full RecordId (e.g., `user:abc123`)
- `transformOrValidateRecordId()` for outbound
- `transformRecordIdToValue()` for inbound
- Bidirectional sync must prepend table: `${tableName}:${id}`

### 4. Type Generation
- Optional non-Record fields get `| null`
- Record fields never get `| null`
- Array fields default to `[]` on create
- Relations are virtual (not stored in DB)

### 5. Code Style
- Newline before return statements
- Inline single-statement if without braces
- Truthy/falsy array length checks (`if (!items.length)`)

## Review Checklist

- [ ] Query parameters properly bound (no inline values)
- [ ] NONE/null handling matches schema definition
- [ ] RecordId transformations applied correctly
- [ ] Types accurately reflect optionality
- [ ] Code style follows project conventions
- [ ] No security vulnerabilities (injection, etc.)
