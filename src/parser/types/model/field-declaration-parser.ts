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
import {
  isCreatedAtDecorator,
  isDefaultAlwaysDecorator,
  isDefaultDecorator,
  isDistinctDecorator,
  isFieldDecorator,
  isFlexibleDecorator,
  isIdDecorator,
  isReadonlyDecorator,
  isIndexDecorator,
  isKeyDecorator,
  isModelDecorator,
  isNowDecorator,
  isOnDeleteDecorator,
  isSortDecorator,
  isUniqueDecorator,
  isUpdatedAtDecorator,
  parseCreatedAtDecorator,
  parseDefaultAlwaysDecorator,
  parseDefaultDecorator,
  parseDistinctDecorator,
  parseFieldDecorator,
  parseFlexibleDecorator,
  parseIdDecorator,
  parseReadonlyDecorator,
  parseIndexDecorator,
  parseKeyDecorator,
  parseModelDecorator,
  parseNowDecorator,
  parseOnDeleteDecorator,
  parseSortDecorator,
  parseUniqueDecorator,
  parseUpdatedAtDecorator,
} from '../field-decorators';
import { extractObjectName, isArrayType, isObjectType, parseFieldType } from '../field-types';

/** Result of parsing a field line */
export interface FieldParseResult {
  field: ASTField | null;
  error: string | null;
}

/** Check if a line is a field declaration */
export function isFieldDeclaration(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed === '{' || trimmed === '}') {
    return false;
  }
  // New format: must have at least two words (fieldName Type)
  // and NOT start with 'model' or 'object'
  const words = trimmed.split(/\s+/);
  return words.length >= 2 && !trimmed.startsWith('model ') && !trimmed.startsWith('object ');
}

/** Parse decorators from a field line (at the end) */
export function parseDecorators(line: string, lineNumber: number): ASTDecorator[] {
  const decorators: ASTDecorator[] = [];
  const decoratorMatches = line.matchAll(/@\w+(?:\([^)]*\))?/g);

  for (const match of decoratorMatches) {
    const token = match[0];
    const col = match.index ?? 0;
    const range = createRange(createPosition(lineNumber, col, 0), createPosition(lineNumber, col + token.length, 0));

    if (isIdDecorator(token)) {
      decorators.push(parseIdDecorator(range));
    } else if (isUniqueDecorator(token)) {
      decorators.push(parseUniqueDecorator(range));
    } else if (isIndexDecorator(token)) {
      decorators.push(parseIndexDecorator(range));
    } else if (isNowDecorator(token)) {
      decorators.push(parseNowDecorator(range));
    } else if (isCreatedAtDecorator(token)) {
      decorators.push(parseCreatedAtDecorator(range));
    } else if (isUpdatedAtDecorator(token)) {
      decorators.push(parseUpdatedAtDecorator(range));
    } else if (isDefaultAlwaysDecorator(token)) {
      decorators.push(parseDefaultAlwaysDecorator(token, range));
    } else if (isDefaultDecorator(token)) {
      decorators.push(parseDefaultDecorator(token, range));
    } else if (isFieldDecorator(token)) {
      decorators.push(parseFieldDecorator(token, range));
    } else if (isModelDecorator(token)) {
      decorators.push(parseModelDecorator(token, range));
    } else if (isOnDeleteDecorator(token)) {
      decorators.push(parseOnDeleteDecorator(token, range));
    } else if (isKeyDecorator(token)) {
      decorators.push(parseKeyDecorator(token, range));
    } else if (isDistinctDecorator(token)) {
      decorators.push(parseDistinctDecorator(range));
    } else if (isSortDecorator(token)) {
      decorators.push(parseSortDecorator(token, range));
    } else if (isFlexibleDecorator(token)) {
      decorators.push(parseFlexibleDecorator(range));
    } else if (isReadonlyDecorator(token)) {
      decorators.push(parseReadonlyDecorator(range));
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
export function parseFieldDeclaration(line: string, lineNumber: number, objectNames?: Set<string>): FieldParseResult {
  const trimmed = line.trim();

  // Remove comments
  const withoutComments = trimmed.replace(/\/\/.*$/, '').trim();
  if (!withoutComments) {
    return { field: null, error: null };
  }

  // Extract decorators from the line (they come after the type)
  const decorators = parseDecorators(withoutComments, lineNumber);

  // Remove decorators from the line for field parsing
  const withoutDecorators = withoutComments.replace(/@\w+(?:\([^)]*\))?/g, '').trim();

  // Parse field name and type
  // Pattern: fieldName Type or fieldName Type? or fieldName Type[]
  const parts = withoutDecorators.split(/\s+/);
  if (parts.length < 2) {
    return { field: null, error: `Invalid field declaration: ${trimmed}` };
  }

  const fieldName = parts[0]!;
  let typeStr = parts[1]!;

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

  // Parse field type (pass objectNames for object type resolution)
  const fieldType = parseFieldType(typeStr, objectNames);
  if (!fieldType) {
    return {
      field: null,
      error: `Invalid field type: ${typeStr}. Use String, Email, Int, Date, Bool, Float, Record, Relation, or array types (String[], Int[], Date[], Record[], Relation[]).`,
    };
  }

  // Create range
  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  // For object types, extract the object name
  const objName = fieldType === 'object' ? extractObjectName(typeStr) : undefined;
  const field = createField(fieldName, fieldType, isOptional, decorators, range, isArray, objName);

  return { field, error: null };
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
