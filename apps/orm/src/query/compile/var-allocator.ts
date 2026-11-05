/**
 * Variable allocator for stable unique variable naming
 */

import type { SchemaFieldType } from '../../types';
import type { QueryVars, VarBinding } from './types';

/** Variable allocator state */
export interface VarAllocator {
  /** Counter for generating unique names */
  counter: number;
  /** Prefix for variable names */
  prefix: string;
  /** Every name issued so far in the statement, shared by all contexts compiled into it */
  issued: Set<string>;
}

/** Create a new variable allocator */
export function createVarAllocator(prefix: string = '', issued: Set<string> = new Set()): VarAllocator {
  return { counter: 0, prefix, issued };
}

/** Generate a unique variable name */
export function generateVarName(allocator: VarAllocator, field: string, operator: string): string {
  // Bound names end in `_<operator>_<prefix><counter>`, read from the right. Two contexts of one statement
  // cannot meet: a prefix sits between the operator and the counter, and no operator is named like a
  // prefix, so a field called `inc_title` cannot reproduce an include name. The SET side (`set`, `push`,
  // `unset`, `create`, `main`) and the WHERE side (the filter operators) use disjoint operators, so a
  // SET value and a WHERE value never share a name whatever the field names are. The `issued` set backs
  // this up: a name already taken in the statement is skipped, never reused.
  const base = `${field}_${operator}`.replace(/[^a-zA-Z0-9_]/g, '_');
  for (;;) {
    const name = `${base}_${allocator.prefix}${allocator.counter++}`;
    if (allocator.issued.has(name)) continue;
    allocator.issued.add(name);

    return name;
  }
}

/** Issue a variable name built from a fixed tag and the counter alone, never from a field or relation name */
export function issueName(allocator: VarAllocator, tag: string): string {
  return generateVarName(allocator, tag, 'n');
}

/** Bind a value to a new variable */
export function bindVar(
  allocator: VarAllocator,
  field: string,
  operator: string,
  value: unknown,
  _fieldType: SchemaFieldType,
): VarBinding {
  const name = generateVarName(allocator, field, operator);
  const placeholder = `$${name}`;
  const vars: QueryVars = { [name]: value };

  return { placeholder, vars };
}

/** Create a filter compile context */
export function createCompileContext(prefix: string = '', issued: Set<string> = new Set()) {
  const allocator = createVarAllocator(prefix, issued);
  const collected: QueryVars = {};

  return {
    bind(field: string, operator: string, value: unknown, fieldType: SchemaFieldType): VarBinding {
      return bindVar(allocator, field, operator, value, fieldType);
    },
    /** A name for a LET variable or a bound value, unique in the statement, built from `tag` and the counter only. */
    name(tag: string): string {
      return issueName(allocator, tag);
    },
    /** The names issued so far; pass it to the context of another part of the same statement. */
    issued: allocator.issued,
    getCounter(): number {
      return allocator.counter;
    },
    /** Keep the bindings of a fragment compiled outside the main query text, such as an include `where`. */
    collect(vars: QueryVars): void {
      Object.assign(collected, vars);
    },
    getCollected(): QueryVars {
      return collected;
    },
  };
}

export type FilterCompileContext = ReturnType<typeof createCompileContext>;
