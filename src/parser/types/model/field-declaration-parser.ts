/**
 * Parser for field declarations
 * New format: fieldName Type @decorators
 * Example: id String @id
 *          email Email @unique
 *          createdAt Date @now
 */

import type { ASTDecorator, ASTField, SourceRange } from '../../../types';
import { isValidFieldName } from '../../../utils/validation-utils';
import { createField, createRange, createPosition } from '../ast';
import { parseFieldType } from '../field-types';
import {
  isUniqueDecorator,
  parseUniqueDecorator,
  isNowDecorator,
  parseNowDecorator,
  isDefaultDecorator,
  parseDefaultDecorator,
  isIdDecorator,
  parseIdDecorator,
} from '../field-decorators';

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
  // and NOT start with 'model'
  const words = trimmed.split(/\s+/);
  return words.length >= 2 && !trimmed.startsWith('model ');
}

/** Parse decorators from a field line (at the end) */
export function parseDecorators(line: string, lineNumber: number): ASTDecorator[] {
  const decorators: ASTDecorator[] = [];
  const decoratorMatches = line.matchAll(/@\w+(?:\([^)]*\))?/g);

  for (const match of decoratorMatches) {
    const token = match[0];
    const col = match.index ?? 0;
    const range = createRange(
      createPosition(lineNumber, col, 0),
      createPosition(lineNumber, col + token.length, 0),
    );

    if (isIdDecorator(token)) {
      decorators.push(parseIdDecorator(range));
    } else if (isUniqueDecorator(token)) {
      decorators.push(parseUniqueDecorator(range));
    } else if (isNowDecorator(token)) {
      decorators.push(parseNowDecorator(range));
    } else if (isDefaultDecorator(token)) {
      decorators.push(parseDefaultDecorator(token, range));
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
 */
export function parseFieldDeclaration(
  line: string,
  lineNumber: number,
): FieldParseResult {
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
  // Pattern: fieldName Type or fieldName Type?
  const parts = withoutDecorators.split(/\s+/);
  if (parts.length < 2) {
    return { field: null, error: `Invalid field declaration: ${trimmed}` };
  }

  const fieldName = parts[0]!;
  let typeStr = parts[1]!;

  // Check for optional marker (Type?)
  const isOptional = typeStr.endsWith('?');
  if (isOptional) {
    typeStr = typeStr.slice(0, -1);
  }

  // Validate field name
  if (!isValidFieldName(fieldName)) {
    return { field: null, error: `Invalid field name: ${fieldName}` };
  }

  // Parse field type
  const fieldType = parseFieldType(typeStr);
  if (!fieldType) {
    return { field: null, error: `Invalid field type: ${typeStr}. Use String, Email, Int, Date, Bool, or Float.` };
  }

  // Create range
  const range = createRange(
    createPosition(lineNumber, 0, 0),
    createPosition(lineNumber, trimmed.length, 0),
  );

  const field = createField(fieldName, fieldType, isOptional, decorators, range);

  return { field, error: null };
}

/** Extract field name from declaration */
export function extractFieldName(line: string): string | null {
  const trimmed = line.trim().replace(/@\w+(?:\([^)]*\))?/g, '').trim();
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? null;
}

/** Extract field type from declaration */
export function extractFieldType(line: string): string | null {
  const trimmed = line.trim().replace(/@\w+(?:\([^)]*\))?/g, '').trim();
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
  const trimmed = line.trim().replace(/@\w+(?:\([^)]*\))?/g, '').trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return false;
  return parts[1]!.endsWith('?');
}
