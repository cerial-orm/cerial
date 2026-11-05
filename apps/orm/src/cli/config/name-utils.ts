/**
 * Utility functions for schema name transformations
 */

import { CerialGenerationError } from '../../errors';
import { generatedNameProblem, isPrototypeName } from '../../utils/generated-name';
import { FIXED_EXPORTS } from '../validators/name-validator';
import { isReservedSchemaName, SCHEMA_NAME_PATTERN } from './validator';

/**
 * Convert schema name to PascalCase client class name
 * Examples: 'auth' -> 'AuthCerialClient', 'my-auth' -> 'MyAuthCerialClient'
 */
export function toClientClassName(schemaName: string | undefined | null): string {
  if (!schemaName) {
    return 'CerialClient';
  }

  const parts = schemaName.split(/[-_]+/);
  const pascalParts = parts.map((part) => {
    if (!part) return '';

    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  const className = pascalParts.filter((p) => p.length > 0).join('');

  return className ? `${className}CerialClient` : 'CerialClient';
}

/** Why `className` cannot be a generated client class, or undefined when it can; the default `CerialClient` is allowed */
export function clientClassNameProblem(className: string): string | undefined {
  if (className === 'CerialClient') return undefined;
  const problem = generatedNameProblem(className, 'model');
  if (problem) return `its client class '${className}' is invalid: ${problem}`;
  if (FIXED_EXPORTS.has(className)) {
    return `its client class '${className}' collides with a name the client always exports`;
  }

  return undefined;
}

/** Why `name` cannot name a schema, or undefined when it can */
export function schemaNameProblem(name: unknown): string | undefined {
  if (typeof name !== 'string' || !SCHEMA_NAME_PATTERN.test(name)) {
    return 'a name must start with a letter and use only letters, digits, hyphens and underscores';
  }
  if (isReservedSchemaName(name) || isPrototypeName(name)) return `'${name}' is reserved`;

  return clientClassNameProblem(toClientClassName(name));
}

/** Refuses a bad client class name when a generator is called directly, so nothing is written */
export function assertClientClassName(className: string): void {
  const problem = clientClassNameProblem(className);
  if (problem) throw new CerialGenerationError(`Client class name '${className}' cannot be used: ${problem}`);
}

/** The first pair of names that derive the same client class, ignoring case: they would share one migration state key */
export function findDuplicateClassNames(names: readonly string[]): [string, string] | undefined {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = toClientClassName(name).toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) return [first, name];
    seen.set(key, name);
  }

  return undefined;
}

/** Refuses a schema name derived from a folder; generate never renames, so the user sets `name` in the folder config */
export function assertFolderSchemaName(name: string, dir: string): void {
  const problem = schemaNameProblem(name);
  if (!problem) return;

  throw new CerialGenerationError(
    `Schema folder '${dir}' gives the schema name '${name}', which cannot be used: ${problem}. Set \`name\` in the folder's cerial.config to a valid name.`,
  );
}
