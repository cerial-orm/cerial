/**
 * The one rule for a name a schema carries into generated code and DDL. Refusing beats escaping: every
 * sink would otherwise have to stay correct forever.
 */

import { IDENTIFIER_PATTERN } from '../parser/tokenizer';

/** Names that print as type and const identifiers; the rest print as property keys, where reserved words are legal */
const DECLARATION_KINDS: ReadonlySet<string> = new Set(['model', 'object', 'tuple', 'literal', 'enum']);

/**
 * Every own property name of `Object.prototype` (`constructor`, `__proto__`, `toString`, `valueOf`, ...) plus
 * `prototype`. A field of that name clashes with the inherited member in generated types and breaks creates
 * and unset writes, whatever kind of name it is.
 */
const PROTOTYPE_NAMES: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

/** Why `name` cannot be a generated name of `kind` (`model`, `field`, `tuple element`, `enum value`, ...), or undefined when it can */
export function generatedNameProblem(name: unknown, kind: string): string | undefined {
  if (typeof name !== 'string' || !IDENTIFIER_PATTERN.test(name)) {
    return 'a name must be an identifier (a letter or underscore, then letters, digits and underscores)';
  }
  if (PROTOTYPE_NAMES.has(name)) return `'${name}' is reserved`;
  if (DECLARATION_KINDS.has(kind) && RESERVED_WORDS.has(name)) return `'${name}' is a reserved word`;

  return undefined;
}

/** Whether `value` is a name no schema may carry as a key or a value: it reaches the prototype chain */
export function isPrototypeName(value: unknown): boolean {
  return typeof value === 'string' && PROTOTYPE_NAMES.has(value);
}

export function isGeneratedName(name: unknown, kind: string): boolean {
  return generatedNameProblem(name, kind) === undefined;
}
