import type { FieldModel, FieldPath } from './types';

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSERS = new Set(Object.values(OPENERS));

interface Scan {
  /** Top-level separator positions for the requested separator. */
  readonly cuts: number[];
  readonly balanced: boolean;
}

/** Walks text once, honouring quotes and bracket depth; `->` is not a closing bracket. */
function scan(text: string, separator: string): Scan {
  const cuts: number[] = [];
  const stack: string[] = [];
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch in OPENERS) stack.push(OPENERS[ch]!);
    else if (CLOSERS.has(ch) && !(ch === '>' && text[i - 1] === '-')) {
      if (stack.pop() !== ch) return { cuts, balanced: false };
    } else if (ch === separator && !stack.length) cuts.push(i);
  }

  return { cuts, balanced: !quote && !stack.length };
}

function split(text: string, separator: string): string[] {
  const { cuts } = scan(text, separator);
  const parts: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    parts.push(text.slice(from, cut));
    from = cut + 1;
  }
  parts.push(text.slice(from));

  return parts.map((part) => part.trim());
}

const GENERIC = /^([A-Za-z_][A-Za-z0-9_]*)<([\s\S]*)>$/;

function members(text: string): string[] {
  const result: string[] = [];
  for (const member of split(text, '|')) {
    const generic = GENERIC.exec(member);
    if (generic && generic[1]!.toLowerCase() === 'option') {
      result.push(...members(generic[2]!));
      result.push('none');
    } else if (generic) {
      const inner = split(generic[2]!, ',').map(canonicalMembers);
      result.push(`${generic[1]}<${inner.join(', ')}>`);
    } else result.push(member);
  }

  return result;
}

function canonicalMembers(text: string): string {
  return [...new Set(members(text))].sort().join(' | ');
}

/**
 * One form for a SurrealDB type: `option<T>` becomes `none | T`, unions flatten, dedupe and sort, and
 * generics canonicalise inside. Text with unbalanced brackets or quotes is returned unchanged so it
 * surfaces as a difference instead of being guessed at.
 */
export function canonicalType(type: string): string {
  const text = type.trim();
  if (!text || !scan(text, '|').balanced) return type;

  return canonicalMembers(text);
}

function hasOuterParens(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false;
  const inner = text.slice(1, -1);

  return scan(inner, '\0').balanced;
}

const FLOAT_SUFFIX = /^(-?\d+(?:\.\d+)?)f$/;
const SIMPLE_DOUBLE_QUOTED = /^"([^"'\\]*)"$/;

/**
 * One form for a DEFAULT, VALUE or ASSERT expression: outer parentheses stripped, a numeric `f` suffix
 * dropped and a plain double-quoted string written with single quotes. Anything with unbalanced
 * brackets or quotes is returned unchanged.
 */
export function canonicalExpression(expression: string): string {
  let text = expression.trim();
  if (!text || !scan(text, '\0').balanced) return expression;

  while (hasOuterParens(text)) text = text.slice(1, -1).trim();

  const float = FLOAT_SUFFIX.exec(text);
  if (float) return float[1]!;
  const quoted = SIMPLE_DOUBLE_QUOTED.exec(text);
  if (quoted) return `'${quoted[1]}'`;

  return text;
}

export interface FieldInput {
  readonly path: FieldPath;
  readonly kind: string;
  readonly default?: string | null;
  readonly defaultAlways?: boolean | null;
  readonly value?: string | null;
  readonly assert?: string | null;
  readonly readonly?: boolean | null;
  readonly flexible?: boolean | null;
}

/** Builds a `FieldModel` from either side, canonicalising each text and omitting every absent key. */
export function buildFieldModel(input: FieldInput): FieldModel {
  return {
    path: input.path,
    kind: canonicalType(input.kind),
    ...(input.default != null && { default: canonicalExpression(input.default) }),
    ...(input.default != null && input.defaultAlways && { defaultAlways: true as const }),
    ...(input.value != null && { value: canonicalExpression(input.value) }),
    ...(input.assert != null && { assert: canonicalExpression(input.assert) }),
    ...(input.readonly && { readonly: true as const }),
    ...(input.flexible && { flexible: true as const }),
  };
}
