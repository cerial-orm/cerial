/**
 * Parser for field declarations
 * New format: fieldName Type @decorators
 * Example: id String @id
 *          email Email @unique
 *          createdAt Date @now
 *          profileId Record?
 *          posts Relation @field(postIds) @model(Post)
 */

import type { ASTDecorator, ASTField } from '../../../types';
import { isValidFieldName } from '../../../utils/validation-utils';
import { createField, createPosition, createRange } from '../ast';
import { matchDecoratorToken } from '../../registry';
import { SIZED_NUMBER_TYPES } from '../field-types/sized-number-parser';
import { isTypeName, toleratesUnresolvedTypes } from '../../unresolved-types';
import { hasValidSortArgument, hasValidUniqueArgument, invalidUniqueArgumentMessage } from '../field-decorators';
import {
  extractLiteralName,
  extractObjectName,
  extractTupleName,
  isArrayType,
  parseFieldType,
  parseRecordIdTypes,
} from '../field-types';

const SIZED_NUMBER_NAMES = SIZED_NUMBER_TYPES.map((t) => t.name).join(', ');

/** Result of parsing a field line */
export interface FieldParseResult {
  field: ASTField | null;
  error: string | null;
  /** Errors for bare value-requiring decorators (reported separately from `error`) */
  decoratorErrors?: string[];
}

/** Check if a line is a field declaration */
export function isFieldDeclaration(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed === '{' || trimmed === '}') {
    return false;
  }
  // New format: must have at least two words (fieldName Type)
  // and NOT start with 'model', 'object', or 'tuple'
  const words = trimmed.split(/\s+/);

  return (
    words.length >= 2 &&
    !trimmed.startsWith('model ') &&
    !trimmed.startsWith('object ') &&
    !trimmed.startsWith('tuple ')
  );
}

/** Decorators that REQUIRE a value in parentheses */
const VALUE_REQUIRED_DECORATORS: Record<string, string> = {
  '@default': '@default(value)',
  '@defaultAlways': '@defaultAlways(value)',
  '@model': '@model(ModelName)',
  '@field': '@field(fieldName)',
  '@onDelete': '@onDelete(Action)',
  '@key': '@key(name)',
};

/** Check if a token is a value-requiring decorator with empty parentheses, e.g. @default() */
function isEmptyParenDecorator(token: string): string | undefined {
  const match = token.match(/^(@\w+)\(\s*\)$/);
  if (!match) return undefined;

  return match[1]! in VALUE_REQUIRED_DECORATORS ? match[1] : undefined;
}

/** Parse decorators from a field line (at the end) */
export function parseDecorators(line: string, lineNumber: number, errors?: string[]): ASTDecorator[] {
  const decorators: ASTDecorator[] = [];
  const declarationName = line.trim().split(/\s+/)[0];
  const decoratorMatches = line.matchAll(/@\w+(?:\([^)]*\))?/g);

  for (const match of decoratorMatches) {
    const token = match[0];
    const col = match.index ?? 0;
    const range = createRange(createPosition(lineNumber, col, 0), createPosition(lineNumber, col + token.length, 0));

    const entry = matchDecoratorToken(token);
    if (entry) {
      const emptyDec = isEmptyParenDecorator(token);
      if (emptyDec) {
        errors?.push(`Decorator '${emptyDec}' requires a value. Use ${VALUE_REQUIRED_DECORATORS[emptyDec]}`);
      } else if (entry.name === '@sort') {
        // The shared token regex stops at the first ')', so '@sort (asc)' and '@sort(asc)(desc)' would
        // otherwise drop the trailing group and parse as a valid ascending sort. The handler only sees
        // the token, not the rest of the line, so the stray-group check stays here.
        const stray = line.slice(col + token.length).match(/^\s*(?:\([^)]*\))+/)?.[0] ?? '';
        if (hasValidSortArgument(token) && !stray) decorators.push(entry.parse(token, range) as ASTDecorator);
        else
          errors?.push(
            `Decorator '${token}${stray}' on '${declarationName}' has an invalid argument. Use @sort, @sort(true), @sort(false), @sort(asc) or @sort(desc)`,
          );
      } else if (entry.name === '@unique') {
        // Same stray-group rule as @sort: the token regex stops at the first ')'
        const stray = line.slice(col + token.length).match(/^\s*(?:\([^)]*\))+/)?.[0] ?? '';
        if (hasValidUniqueArgument(token) && !stray) decorators.push(entry.parse(token, range) as ASTDecorator);
        else errors?.push(invalidUniqueArgumentMessage(`${token}${stray}`));
      } else {
        decorators.push(entry.parse(token, range) as ASTDecorator);
      }
    } else if (token in VALUE_REQUIRED_DECORATORS) {
      errors?.push(`Decorator '${token}' requires a value. Use ${VALUE_REQUIRED_DECORATORS[token]}`);
    }
  }

  return decorators;
}

/** Parse a single field declaration line
 * Format: fieldName Type @decorators
 * Example: id String @id
 *          email Email @unique
 *          name String
 *          age Int?
 *          createdAt Date @now
 *          profileId Record?
 *          postIds Record[]
 *          profile Relation @field(profileId) @model(Profile)
 *          posts Relation @field(postIds) @model(Post)
 */
export function parseFieldDeclaration(
  line: string,
  lineNumber: number,
  objectNames?: Set<string>,
  tupleNames?: Set<string>,
  literalNames?: Set<string>,
): FieldParseResult {
  const trimmed = line.trim();

  // Remove comments
  const withoutComments = trimmed.replace(/\/\/.*$/, '').trim();
  if (!withoutComments) {
    return { field: null, error: null };
  }

  // Detect and strip !!private marker (must come at the end, before comments)
  const isPrivate = withoutComments.includes('!!private');
  const withoutPrivate = isPrivate ? withoutComments.replace(/\s*!!private\s*/g, '').trim() : withoutComments;

  // Extract decorators from the line (they come after the type)
  const decoratorErrors: string[] = [];
  const decorators = parseDecorators(withoutPrivate, lineNumber, decoratorErrors);
  // Remove decorators from the line for field parsing
  const withoutDecorators = withoutPrivate.replace(/@\w+(?:\([^)]*\))?/g, '').trim();

  // Parse field name and type
  // Pattern: fieldName Type or fieldName Type? or fieldName Type[]
  const parts = withoutDecorators.split(/\s+/);
  if (parts.length < 2) {
    return { field: null, error: `Invalid field declaration: ${trimmed}` };
  }

  const fieldName = parts[0]!;
  let typeStr = parts[1]!;

  // Handle Record(Type, Type) syntax — spaces after commas cause split issues
  if (typeStr.startsWith('Record(') && !typeStr.includes(')')) {
    let i = 2;
    while (i < parts.length && !typeStr.includes(')')) {
      typeStr += parts[i];
      i++;
    }
  }

  // Check for optional marker (Type?) - but not for array types like Record[]
  const isOptional = typeStr.endsWith('?') && !typeStr.endsWith('[]?');
  if (isOptional) {
    typeStr = typeStr.slice(0, -1);
  }

  // Check if it's an array type (String[], Int[], Date[], Record[], ObjectName[], etc.)
  const isArray = isArrayType(typeStr);

  // Validate field name
  if (!isValidFieldName(fieldName)) {
    return { field: null, error: `Invalid field name: ${fieldName}` };
  }

  // Parse field type (pass objectNames, tupleNames, and literalNames for type resolution)
  // Pass 1 of a mixed entry keeps a field typed by a name TypeScript declares, as a member whose type pass 3 settles
  const fieldType =
    parseFieldType(typeStr, objectNames, tupleNames, literalNames) ??
    (toleratesUnresolvedTypes() && isTypeName(typeStr) ? 'any' : null);
  if (!fieldType) {
    return {
      field: null,
      error: `Invalid field type: ${typeStr}. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, a sized number (${SIZED_NUMBER_NAMES}), or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).`,
    };
  }

  // Create range
  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  // For object types, extract the object name
  const objName = fieldType === 'object' ? extractObjectName(typeStr) : undefined;
  // For tuple types, extract the tuple name
  const tupName = fieldType === 'tuple' ? extractTupleName(typeStr) : undefined;
  // For literal types, extract the literal name
  const litName = fieldType === 'literal' ? extractLiteralName(typeStr) : undefined;
  const recordIdTypes = fieldType === 'record' ? parseRecordIdTypes(typeStr, tupleNames, objectNames) : undefined;
  const field = createField(
    fieldName,
    fieldType,
    isOptional,
    decorators,
    range,
    isArray,
    objName,
    tupName,
    litName,
    recordIdTypes,
    isPrivate || undefined,
  );

  return { field, error: null, decoratorErrors: decoratorErrors.length ? decoratorErrors : undefined };
}

/** Extract field name from declaration */
export function extractFieldName(line: string): string | null {
  const trimmed = line
    .trim()
    .replace(/@\w+(?:\([^)]*\))?/g, '')
    .trim();
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? null;
}

/** Extract field type from declaration */
export function extractFieldType(line: string): string | null {
  const trimmed = line
    .trim()
    .replace(/@\w+(?:\([^)]*\))?/g, '')
    .trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  let typeStr = parts[1]!;
  if (typeStr.endsWith('?')) {
    typeStr = typeStr.slice(0, -1);
  }
  return parseFieldType(typeStr);
}

/** Check if field has optional marker (Type?) */
export function hasOptionalMarker(line: string): boolean {
  const trimmed = line
    .trim()
    .replace(/@\w+(?:\([^)]*\))?/g, '')
    .trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return false;
  return parts[1]!.endsWith('?');
}

/** Check if field is an array type (String[], Int[], Date[], Record[], etc.) */
export function hasArrayMarker(line: string): boolean {
  const trimmed = line
    .trim()
    .replace(/@\w+(?:\([^)]*\))?/g, '')
    .trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return false;
  return isArrayType(parts[1]!);
}
