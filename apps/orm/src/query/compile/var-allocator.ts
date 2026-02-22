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
}

/** Create a new variable allocator */
export function createVarAllocator(prefix: string = ''): VarAllocator {
  return { counter: 0, prefix };
}

/** Generate a unique variable name */
export function generateVarName(allocator: VarAllocator, field: string, operator: string): string {
  const count = allocator.counter++;
  const base = `${allocator.prefix}${field}_${operator}`.replace(/[^a-zA-Z0-9_]/g, '_');

  return `${base}_${count}`;
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
export function createCompileContext(prefix: string = '') {
  const allocator = createVarAllocator(prefix);

  return {
    bind(field: string, operator: string, value: unknown, fieldType: SchemaFieldType): VarBinding {
      return bindVar(allocator, field, operator, value, fieldType);
    },
    getCounter(): number {
      return allocator.counter;
    },
  };
}

export type FilterCompileContext = ReturnType<typeof createCompileContext>;
