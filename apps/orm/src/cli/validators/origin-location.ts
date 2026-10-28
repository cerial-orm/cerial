/**
 * Error locations - the one place a validator turns an AST node's origin into a position
 */

import type { Origin } from '../../types';

/** `SchemaValidationError.line` for a TypeScript origin, which has no line */
export const NO_LINE = 0;

/** Line recorded on a validation error: the source line for `dsl`, `NO_LINE` for `ts` */
export function originLine(origin: Origin): number {
  return origin.kind === 'dsl' ? origin.range.start.line : NO_LINE;
}

/** Human-readable location: `post.cerial:12` for `dsl`, `post.ts (export Post)` for `ts` */
export function formatOrigin(origin: Origin): string {
  return origin.kind === 'dsl'
    ? `${origin.file}:${origin.range.start.line}`
    : `${origin.file} (export ${origin.export})`;
}
