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
): { directive: ASTCompositeDirective } | { error: string } {
  const trimmed = removeComments(line).trim();

  const match = trimmed.match(/^@@(index|unique)\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*(?:,\s*(\w+)\s*)?\)$/);
  if (!match) {
    return {
      error: `Invalid composite directive syntax: ${trimmed}. Expected @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])`,
    };
  }

  const option = match[4];
  if (option !== undefined && option !== 'nullsNotDistinct') {
    return {
      error: `Invalid @@${match[1]} argument '${option}'. Expected @@unique(${match[2]}, [...]) or @@unique(${match[2]}, [...], nullsNotDistinct).`,
    };
  }

  const kind = match[1] as 'index' | 'unique';
  const name = match[2]!;
  const fieldsStr = match[3]!;

  const fields = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  if (!fields.length) {
    return { error: `Composite directive @@${kind}("${name}") must specify at least one field` };
  }

  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  return { directive: createCompositeDirective(kind, name, fields, range, option ? true : undefined) };
}
