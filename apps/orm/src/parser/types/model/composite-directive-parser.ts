/**
 * Parser for model-level composite directives (@@index and @@unique)
 */

import type { ASTCompositeDirective } from '../../../types';
import { removeComments } from '../../../utils/string-utils';
import { createCompositeDirective, createPosition, createRange } from '../ast';

/**
 * Parse a composite directive line.
 * Syntax: @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])
 * Fields support dot notation: address.city
 */
export function parseCompositeDirective(
  line: string,
  lineNumber: number,
): { directive: ASTCompositeDirective | null; error: string | null } {
  const trimmed = removeComments(line).trim();

  // Match: @@index(name, [field1, field2]) or @@unique(name, [field1, field2])
  const match = trimmed.match(/^@@(index|unique)\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*\)$/);
  if (!match) {
    return {
      directive: null,
      error: `Invalid composite directive syntax: ${trimmed}. Expected @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])`,
    };
  }

  const kind = match[1] as 'index' | 'unique';
  const name = match[2]!;
  const fieldsStr = match[3]!;

  // Parse field list (comma-separated, supports dot notation like address.city)
  const fields = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (!fields.length) {
    return { directive: null, error: `Composite directive @@${kind}("${name}") must specify at least one field` };
  }

  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  return { directive: createCompositeDirective(kind, name, fields, range), error: null };
}
