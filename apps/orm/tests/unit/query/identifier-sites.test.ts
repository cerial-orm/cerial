/**
 * Pins the class 5 ("needs review") sites of the query-text interpolation inventory
 * Each entry is a site where a value reaches query text with neither a repo validator nor
 *
 * Each entry names a source line that puts a caller-influenced string into query text with no repo
 * repo-added backticks on at least one path. It is a work list for the follow-up that drives and
 * closes each one, not a verdict that any site is exploitable.
 *
 * Tags: 5a orderBy direction under a @flexible object, 5b nested reverse-create key and the regexp that
 * receives it, 5c record id text escaped only by the SDK, 5d dead helpers, 5e exported formatValue.
 *
 * Closing a site is meant to break this test: remove the entry in the same change.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ReviewSite {
  /** Path from apps/orm, so a rename is a one-line fix here */
  readonly file: string;
  /** The line's text, trimmed; found by content so an unrelated edit above it does not move the pin */
  readonly snippet: string;
  readonly tag: '5a' | '5b' | '5c' | '5d' | '5e';
  readonly why: string;
}

/* oxlint-disable no-template-curly-in-string */
// The snippets are source text that contains template placeholders, matched literally
const NEEDS_REVIEW: readonly ReviewSite[] = [
  {
    file: 'src/query/builder.ts',
    snippet:
      'return executeQuerySingle(this.db, { text: `SELECT ${fields} FROM ONLY ${recordId.toString()};`, vars: {} });',
    tag: '5c',
    why: "upsert's existing-row read (readExisting, builder.ts:636) with the same SDK-escaped id as select-builder.ts:623; fields is line 236",
  },
  {
    file: 'src/query/builders/delete-builder.ts',
    snippet: 'text: `DELETE ${recordId.toString()} ${returnClause}`,',
    tag: '5c',
    why: 'deleteUnique with an id and no dependents (builder.ts:426 -> buildDeleteUniqueQuery); id text SDK-escaped as at select-builder.ts:623',
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet:
      'const statements = [`LET ${varName} = CREATE ONLY ${targetModel.tableName} CONTENT ${contentVar.placeholder};`];',
    tag: '5d',
    why: 'buildNestedCreateStatements builds varName from its bare fieldName parameter (line 95) and interpolates it here. It is exported from the builders barrel and has no caller in src or tests, so no public method reaches it; it is dead code that takes an unchecked name',
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet: 'statements.push(`UPDATE ${targetId} SET ${targetFieldName} ${operator} ${sourceId};`);',
    tag: '5d',
    why: 'buildBidirectionalSyncStatements interpolates three bare string parameters. Exported from the builders barrel, no caller in src or tests; dead code',
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet: "statements.push(`LET $result = CREATE ONLY ${createTarget} SET ${setFields.join(', ')};`);",
    tag: '5c',
    why: "createTarget is options.recordId when set: the record id string builder.ts:696 and builder.ts:1140 build with `.toString()` from the caller's upsert where id; SDK-escaped as at select-builder.ts:623",
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet: 'statements.push(`LET $result = CREATE ONLY ${createTarget} CONTENT ${contentVar.placeholder};`);',
    tag: '5c',
    why: "createTarget is options.recordId when set: the record id string builder.ts:696 and builder.ts:1140 build with `.toString()` from the caller's upsert where id; SDK-escaped as at select-builder.ts:623",
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet: 'const varName = `rev_${idx}_${itemIdx}_${key}`;',
    tag: '5b',
    why: "key is a key of a nested create item for a reverse relation. The item is run through prepareNestedCreateData (applyFieldDefaults, transformData) but not through validateCreateData, whose key check covers only the parent's own data; the target-model lookup at line 601 is used only to skip nulls, not to reject. Path: create / upsert (create half) with `{ <reverse relation>: { create: ... } }` -> extractNestedOperations -> buildCreateWithNestedTransaction reverseCreates (lines 405, 493) -> loop 590-613. The key becomes a bound-variable name and is later fed to prefixQueryVars (executor.ts:223)",
  },
  {
    file: 'src/query/builders/nested-builder.ts',
    snippet: 'setFields.push(`${key} = $${varName}`);',
    tag: '5b',
    why: 'same key as line 607, interpolated as the column name of `CREATE ONLY ${table} SET ...` (line 612) with no metadata check and no quoting',
  },
  {
    file: 'src/query/builders/select-builder.ts',
    snippet: 'ctx.parts.push(`${alias} ${direction}`);',
    tag: '5a',
    why: "direction is `directionOrNested.toUpperCase()` (line 327) from the caller's orderBy value. validateOrderBy rejects a direction other than asc/desc only for keys it finds in metadata; for an unknown sub-key under a @flexible object it does `continue` without looking at the value (select-validator.ts:121-123), and buildOrderByParts then emits it. This alias branch is the one taken after crossing a relation, so it is reached through a @flexible object on the relation target. Path: findOne or findMany orderBy (assertValidReadOptions builder.ts:104 -> buildSelectQuery, select-builder.ts:395-414), and any include orderBy via buildIncludeSubquery (relation-builder.ts:100-113); findUnique rejects orderBy",
  },
  {
    file: 'src/query/builders/select-builder.ts',
    snippet: 'ctx.parts.push(`${path} ${direction}`);',
    tag: '5a',
    why: 'same source as line 333: an unvalidated direction string under a @flexible object sub-key, in the own-field branch. Reaches the ORDER BY of findOne and findMany and of every include orderBy',
  },
  {
    file: 'src/query/builders/select-builder.ts',
    snippet:
      'const parts = [`SELECT ${fields} FROM ONLY ${recordId.toString()}`, whereClause.text, limitClause].filter((p) => p);',
    tag: '5c',
    why: "the id part of the record id is a caller value (findUnique where.id, builder.ts:156-166 -> buildFindUniqueByIdQuery). Only the table is validated (transformOrValidateRecordId, data-transformer.ts:123-135); the id text is escaped by the SDK's RecordId.toString (surrealdb 2.0.9 escapeIdent / toSurqlString), not by code in this repo. SDK escaping is unconfirmed here: it prefixes a backslash to the closing bracket and this scan did not see it escape a backslash already in the id",
  },
  {
    file: 'src/query/builders/update-builder.ts',
    snippet: '`UPDATE ONLY ${recordId.toString()}`,',
    tag: '5c',
    why: 'updateUnique with an id in where (builder.ts:290 -> buildUpdateUniqueQuery); id text is SDK-escaped as at select-builder.ts:623',
  },
  {
    file: 'src/query/builders/update-builder.ts',
    snippet: "text: wrap(recordId.toString(), whereClause.text, parts.join(' ')),",
    tag: '5c',
    why: 'same id as line 706, interpolated a second time by the before-snapshot',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet: 'statements.push(`LET $exists = (SELECT * FROM ONLY ${recordId.toString()});`);',
    tag: '5c',
    why: 'upsert with an id in where (builder.ts:517, compileUpsert builder.ts:1069); id text is SDK-escaped as at select-builder.ts:623; line 353 also embeds the select list from line 236',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet:
      '`LET $before = (SELECT ${buildSelectFields(select, model, include, registry)} FROM ONLY ${recordId.toString()});`,',
    tag: '5c',
    why: 'upsert with an id in where (builder.ts:517, compileUpsert builder.ts:1069); id text is SDK-escaped as at select-builder.ts:623; line 353 also embeds the select list from line 236',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet:
      "createQuery = `CREATE ONLY ${recordId.toString()} SET ${createSetParts.join(', ')}${createReturn ? ` ${createReturn}` : ''}`;",
    tag: '5c',
    why: 'same id as line 348, on the create half',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet:
      "createQuery = `CREATE ONLY ${recordId.toString()} CONTENT ${createBinding!.placeholder}${createReturn ? ` ${createReturn}` : ''}`;",
    tag: '5c',
    why: 'same id as line 348, on the create half',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet: 'updateQuery = `UPDATE ONLY ${recordId.toString()}`;',
    tag: '5c',
    why: 'same id as line 348, on the update half',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet: 'updateQuery = `SELECT * FROM ONLY ${recordId.toString()}`;',
    tag: '5c',
    why: 'same id as line 348, on the update half',
  },
  {
    file: 'src/query/builders/upsert-builder.ts',
    snippet: '? `(SELECT id FROM ONLY ${recordId})`',
    tag: '5c',
    why: "recordId is the string builder.ts:1140 builds with `.toString()` from the caller's where id, for an upsert with relation operations in array-mode $transaction; same SDK escaping",
  },
  {
    file: 'src/query/executor.ts',
    snippet: "const varRegex = new RegExp(`\\\\$${name}(?=\\\\b|[^\\\\w])`, 'g');",
    tag: '5b',
    why: 'name is every key of the compiled vars object, including the row-607 name built from a caller key; the regexp and the replacement therefore take caller text unescaped. For every other builder the name comes from var-allocator.ts:24, which is sanitised',
  },
  {
    file: 'src/query/executor.ts',
    snippet: 'text = text.replace(varRegex, `$${prefix}${name}`);',
    tag: '5b',
    why: 'name is every key of the compiled vars object, including the row-607 name built from a caller key; the regexp and the replacement therefore take caller text unescaped. For every other builder the name comes from var-allocator.ts:24, which is sanitised',
  },
  {
    file: 'src/query/transformers/value-formatter.ts',
    snippet: 'return `"${escapeString(String(value))}"`;',
    tag: '5e',
    why: 'formatValue is exported from the package root (index.ts:321) and used by no code in src. escapeString (utils/string-utils.ts:32) escapes quotes but not a backslash, so a caller value ending in a backslash is not neutralised. Not reachable from any ORM method; reachable only if a caller builds query text with this helper',
  },
  {
    file: 'src/query/transformers/value-formatter.ts',
    snippet: 'return `"${escapeString(value)}"`;',
    tag: '5e',
    why: 'formatValue is exported from the package root (index.ts:321) and used by no code in src. escapeString (utils/string-utils.ts:32) escapes quotes but not a backslash, so a caller value ending in a backslash is not neutralised. Not reachable from any ORM method; reachable only if a caller builds query text with this helper',
  },
  {
    file: 'src/query/transformers/value-formatter.ts',
    snippet: 'return `d"${String(value)}"`;',
    tag: '5e',
    why: 'no escaping at all, same exported helper',
  },
  {
    file: 'src/query/transformers/value-formatter.ts',
    snippet: 'return String(value);',
    tag: '5e',
    why: 'no escaping at all, same exported helper',
  },
];
/* oxlint-enable no-template-curly-in-string */

const ORM_ROOT = resolve(import.meta.dir, '../../..');

function linesOf(file: string): string[] {
  return readFileSync(resolve(ORM_ROOT, file), 'utf-8')
    .split('\n')
    .map((line) => line.trim());
}

describe('query-text interpolation inventory: class 5 sites', () => {
  test('the set is not empty', () => {
    expect(NEEDS_REVIEW.length).toBeGreaterThan(0);
  });

  test.each(NEEDS_REVIEW.map((site) => [`${site.tag} ${site.file}: ${site.snippet.slice(0, 70)}`, site] as const))(
    '%s is still in the source',
    (_label, site) => {
      const hits = linesOf(site.file).filter((line) => line === site.snippet);

      // A site that vanished was fixed or moved: update the pin when you change it
      expect(hits.length).toBeGreaterThan(0);
    },
  );

  test('every site names a distinct file and line text', () => {
    const keys = NEEDS_REVIEW.map((site) => `${site.file}\n${site.snippet}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the sites cover the five tags the inventory reports', () => {
    const tags = new Set(NEEDS_REVIEW.map((site) => site.tag));

    expect([...tags].sort()).toEqual(['5a', '5b', '5c', '5d', '5e']);
  });
});
