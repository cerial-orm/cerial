/**
 * Parser for model declarations
 */

import { toSnakeCase } from '../../../utils/string-utils';
import { isValidModelName } from '../../../utils/validation-utils';

/** Check if a line is a model declaration */
export function isModelDeclaration(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('model ') && trimmed.includes('{');
}

/** Extract model name from declaration line */
export function extractModelName(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^model\s+(\w+)\s*\{?/);
  if (!match) return null;

  const name = match[1]!;
  if (!isValidModelName(name)) return null;

  return name;
}

/** Convert model name to table name */
export function modelNameToTableName(modelName: string): string {
  return toSnakeCase(modelName);
}

/** Parse model declaration and return model name and table name */
export function parseModelDeclaration(line: string): { name: string; tableName: string } | null {
  const name = extractModelName(line);
  if (!name) return null;

  return {
    name,
    tableName: modelNameToTableName(name),
  };
}
