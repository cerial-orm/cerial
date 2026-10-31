/**
 * The `sql` tag: a raw SurrealQL fragment whose interpolated values are always bound, never spliced.
 *
 * The static text is developer-authored and trusted. Every hole is data, except a nested fragment, `sql.ident`
 * and `sql.int`, which splice. Nothing inspects the text.
 */

import { CerialValidationError } from '../../errors';
import { isCerialBytes } from '../../utils/cerial-bytes';
import { isCerialDecimal } from '../../utils/cerial-decimal';
import { isCerialDuration } from '../../utils/cerial-duration';
import { isCerialGeometry } from '../../utils/cerial-geometry';
import { isCerialId } from '../../utils/cerial-id';
import { isCerialUuid } from '../../utils/cerial-uuid';
import type { FilterCompileContext } from './var-allocator';
import type { QueryFragment } from './types';

// Symbol.for so the ESM and CJS bundles of the package agree on one brand.
const SQL_BRAND = Symbol.for('cerial.sql');

/** A raw SurrealQL fragment. `T` is the caller's unchecked claim about the value the fragment yields. */
export interface SqlFragment<T = unknown> {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
  /** Type-level only; never present at runtime. */
  readonly __type?: T;
}

/**
 * True only for a fragment this module built. The brand is a non-enumerable own property, so a spread,
 * `structuredClone` or JSON round trip drops it, and `Object.create(fragment)` inherits it without owning it.
 */
export function isSqlFragment(value: unknown): value is SqlFragment {
  if (typeof value !== 'object' || value === null) return false;

  return Object.hasOwn(value, SQL_BRAND) && (value as Record<symbol, unknown>)[SQL_BRAND] === true;
}

function makeFragment(strings: readonly string[], values: readonly unknown[]): SqlFragment {
  const fragment = { strings: Object.freeze([...strings]), values: Object.freeze([...values]) };
  Object.defineProperty(fragment, SQL_BRAND, { value: true, enumerable: false });

  return Object.freeze(fragment);
}

export function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

// Deeper than any real payload; the recursive walks here would otherwise overflow the stack on a hostile one.
const MAX_HOLE_DEPTH = 64;

/** Refuse `undefined`, a nested fragment, a cycle and excessive depth anywhere inside an array or plain-object hole. */
function checkHole(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === undefined) {
    throw new CerialValidationError(`sql: ${path} is undefined; a value of undefined would silently match NONE`);
  }
  if (typeof value !== 'object' || value === null) return;
  if (isSqlFragment(value)) {
    throw new CerialValidationError(
      `sql: ${path} is a fragment inside an array or object; interpolate a fragment directly so it can nest`,
    );
  }
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) return;
  if (ancestors.has(value)) {
    throw new CerialValidationError(`sql: ${path} refers back to one of its parents; a cyclic value cannot be bound`);
  }
  if (ancestors.size >= MAX_HOLE_DEPTH) {
    throw new CerialValidationError(`sql: ${path} is nested deeper than ${MAX_HOLE_DEPTH} levels`);
  }
  ancestors.add(value);

  const entries: Array<[string, unknown]> = isArray
    ? value.map((item, i): [string, unknown] => [`[${i}]`, item])
    : Object.keys(value).map((key): [string, unknown] => [`.${key}`, (value as Record<string, unknown>)[key]]);
  for (const [suffix, item] of entries) checkHole(item, `${path}${suffix}`, ancestors);
  ancestors.delete(value);
}

/**
 * The template's raw text, so `\d` in a regex reaches the database as written. Only an escaped backtick or
 * dollar is un-escaped, which is how a developer writes one inside a template. Pairs are consumed together so
 * `\\` followed by `$` is not mistaken for an escaped dollar.
 */
function rawText(part: string): string {
  return part.replace(/\\([\s\S])/g, (pair, next: string) => (next === '`' || next === '$' ? next : pair));
}

function sqlTag<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment<T> {
  if (typeof strings === 'string') {
    throw new CerialValidationError('sql: call it as a tagged template, sql`...`, not as a function of a string');
  }
  if (!Array.isArray(strings) || !Object.isFrozen(strings) || !Array.isArray((strings as { raw?: unknown }).raw)) {
    throw new CerialValidationError('sql: call it as a tagged template, sql`...`');
  }
  if (strings.length !== values.length + 1) {
    throw new CerialValidationError('sql: the template does not match its values');
  }
  // Cooked strings turn `\d` into `d` and are undefined for an invalid escape such as `\u`.
  const parts = (strings as unknown as { raw: readonly string[] }).raw.map(rawText);
  if (!values.length && parts.every((part) => !part.trim())) {
    throw new CerialValidationError('sql: the fragment is empty');
  }
  values.forEach((value, i) => {
    // Only a direct hole nests; anywhere deeper a fragment is refused by checkHole.
    if (!isSqlFragment(value)) checkHole(value, `hole ${i}`, new Set());
  });

  return makeFragment(parts, values) as SqlFragment<T>;
}

function ident(name: string): SqlFragment {
  if (typeof name !== 'string') throw new CerialValidationError('sql.ident: the name must be a string');

  // Always quoted, even for a plain word or keyword, so no name is ever read as syntax.
  return makeFragment([`\`${name.replace(/[\\`]/g, '\\$&')}\``], []);
}

function int(value: number): SqlFragment {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new CerialValidationError('sql.int: the value must be a safe integer');
  }

  // A leading space keeps a negative from fusing with a preceding `-` into a `--` comment.
  return makeFragment([(value < 0 ? ' ' : '') + value], []);
}

export const sql: typeof sqlTag & { ident: typeof ident; int: typeof int } = Object.assign(sqlTag, { ident, int });

/** Turn Cerial's wrappers into the driver values the database understands, inside arrays and plain objects. */
function unwrap(value: unknown): unknown {
  if (isCerialId(value)) return value.toRecordId();
  if (isCerialUuid(value)) return value.toNative();
  if (isCerialDuration(value)) return value.toNative();
  if (isCerialDecimal(value)) return value.toNative();
  if (isCerialBytes(value)) return value.toNative();
  if (isCerialGeometry(value)) return value.toNative();
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(unwrap);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)]));
}

/** Compile a fragment at the position it lands in: every value is bound through `ctx`, nested fragments splice. */
export function compileFragment(fragment: SqlFragment, ctx: FilterCompileContext): QueryFragment {
  if (!isSqlFragment(fragment)) {
    throw new CerialValidationError('sql: expected a fragment built by the sql tag');
  }
  const vars: Record<string, unknown> = {};
  let text = fragment.strings[0]!;

  fragment.values.forEach((value, i) => {
    if (isSqlFragment(value)) {
      const inner = compileFragment(value, ctx);
      Object.assign(vars, inner.vars);
      text += inner.text;
    } else {
      const binding = ctx.bind('raw', 'param', unwrap(value), 'any');
      Object.assign(vars, binding.vars);
      text += binding.placeholder;
    }
    text += fragment.strings[i + 1]!;
  });

  return { text, vars };
}
