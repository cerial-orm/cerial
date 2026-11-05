import { isImportableExportName } from '../../../parser/builder/materialise';
import { IDENTIFIER_PATTERN } from '../../../parser/tokenizer';
import { quote } from './strings';

/** The local name each builder call is imported under; `enum` is a keyword, so it is imported as `enumeration`. */
export const BUILDER_CALLEES = {
  model: 'model',
  object: 'object',
  tuple: 'tuple',
  literal: 'literal',
  enum: 'enumeration',
} as const;

/** Every name a module imports from the builder, which a declaration must not shadow. */
export const BUILDER_IMPORTS: readonly string[] = [...Object.values(BUILDER_CALLEES), 'e', 'f', 'variant'].sort();

const RESERVED_WORDS = [
  'arguments',
  'async',
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
  'eval',
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
  'of',
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
  'undefined',
  'NaN',
  'Infinity',
  'var',
  'void',
  'while',
  'with',
  'yield',
];

const UNSAFE_BINDINGS = new Set([...RESERVED_WORDS, ...BUILDER_IMPORTS]);

/** Whether a declaration with this name can be bound to a `const` of the same name. */
export function isSafeBinding(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name) && !UNSAFE_BINDINGS.has(name);
}

/**
 * The `const` a declaration is bound to: its own name, or an underscore-prefixed one when that name is a
 * reserved word or a builder import. `taken` holds names already bound in the module, so an alias never
 * lands on one.
 */
export function bindingFor(name: string, taken: ReadonlySet<string> = new Set()): string {
  if (isSafeBinding(name)) return name;
  let binding = `_${name}`;
  while (taken.has(binding) || UNSAFE_BINDINGS.has(binding)) binding = `_${binding}`;

  return binding;
}

/** Bindings for a module's declarations: ordinary names keep theirs, so an alias never takes one of them. */
export function assignBindings(names: readonly string[]): Map<string, string> {
  const bindings = new Map<string, string>();
  const taken = new Set(names.filter(isSafeBinding));
  for (const name of names) {
    const binding = bindingFor(name, taken);
    taken.add(binding);
    bindings.set(name, binding);
  }

  return bindings;
}

/** The export of a bound declaration; an aliased one keeps its real name as the export name. */
export function exportStatement(name: string, binding: string, init: string): string {
  if (binding === name) return `export const ${binding} = ${init};`;

  return `const ${binding} = ${init};\nexport { ${binding} as ${name} };`;
}

/**
 * A key of an object literal. `__proto__` written plainly sets the prototype and no field, so it is
 * computed, which makes it an own property.
 */
export function propertyKey(name: string): string {
  if (name === '__proto__') return `[${quote(name)}]`;

  return IDENTIFIER_PATTERN.test(name) ? name : quote(name);
}

/**
 * Why a kept TypeScript module's export name cannot be written into an import, or undefined when it can.
 * The name comes from source text (a string export name can hold anything), so only an identifier or `default`
 * is printed; a reserved word or `default` is imported under a safe alias by `bindingFor`.
 */
export function exportNameProblem(name: string): string | undefined {
  if (isImportableExportName(name)) return undefined;

  return 'an export name must be an identifier (a letter or underscore, then letters, digits and underscores) or default';
}
