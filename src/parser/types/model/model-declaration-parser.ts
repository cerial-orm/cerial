/**
 * Parser for model declarations
 */

import type { ExtendsFilter } from '../../../types';
import { toSnakeCase } from '../../../utils/string-utils';
import { isValidModelName } from '../../../utils/validation-utils';

/** Parse extends bracket syntax: [field1, field2] = pick, [!field1, !field2] = omit */
export function parseExtendsBracket(bracketContent: string): ExtendsFilter | undefined {
  if (!bracketContent) return undefined;

  const items = bracketContent
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!items.length) return undefined;

  const hasOmit = items.some((s) => s.startsWith('!'));
  const hasPick = items.some((s) => !s.startsWith('!'));

  // Mixed ! and non-! is invalid — return undefined
  if (hasOmit && hasPick) return undefined;

  if (hasOmit) {
    return { mode: 'omit', fields: items.map((s) => s.slice(1).trim()) };
  }

  return { mode: 'pick', fields: items };
}

/** Regex for model declarations: captures abstract, name, extends target, bracket content */
const MODEL_REGEX = /^(?:(abstract)\s+)?model\s+(\w+)(?:\s+extends\s+(\w+)(?:\[([^\]]*)\])?)?\s*\{?/;

/** Check if a line is a model declaration */
export function isModelDeclaration(line: string): boolean {
  const trimmed = line.trim();

  return (trimmed.startsWith('model ') || trimmed.startsWith('abstract model ')) && trimmed.includes('{');
}

/** Extract model name from declaration line */
export function extractModelName(line: string): string | null {
  const trimmed = line.trim();
  const match = trimmed.match(MODEL_REGEX);
  if (!match) return null;

  const name = match[2]!;
  if (!isValidModelName(name)) return null;

  return name;
}

/** Convert model name to table name */
export function modelNameToTableName(modelName: string): string {
  return toSnakeCase(modelName);
}

/** Parse model declaration and return model name, table name, and extends info */
export function parseModelDeclaration(line: string): {
  name: string;
  tableName: string;
  abstract?: boolean;
  extends_?: string;
  extendsFilter?: ExtendsFilter;
} | null {
  const trimmed = line.trim();
  const match = trimmed.match(MODEL_REGEX);
  if (!match) return null;

  const isAbstract = match[1] === 'abstract';
  const name = match[2]!;
  const extendsTarget = match[3];
  const bracketContent = match[4];

  if (!isValidModelName(name)) return null;

  const result: {
    name: string;
    tableName: string;
    abstract?: boolean;
    extends_?: string;
    extendsFilter?: ExtendsFilter;
  } = {
    name,
    tableName: modelNameToTableName(name),
  };

  if (isAbstract) result.abstract = true;
  if (extendsTarget) result.extends_ = extendsTarget;
  if (bracketContent !== undefined && bracketContent !== '') {
    const filter = parseExtendsBracket(bracketContent);
    if (filter) result.extendsFilter = filter;
  }

  return result;
}
