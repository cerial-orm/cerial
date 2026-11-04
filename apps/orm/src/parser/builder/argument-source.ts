/**
 * Renders a builder argument back to the text the entry's own `parse` handler reads. Going through the
 * handler is what makes a builder node equal the parser's node, `value` and `origin` included.
 */

import type { ArgumentShape, DecoratorEntry } from '../registry';

/** Fails to compile when a switch over `ArgumentShape['kind']` misses a member. */
function assertNever(value: never): never {
  throw new Error(`Unhandled argument shape ${JSON.stringify(value)}`);
}

/** `chain` is a method taking at most one value; `options` takes several independent parts. */
export function bucketOf(args: ArgumentShape): 'chain' | 'options' {
  switch (args.kind) {
    case 'none':
    case 'choice':
    case 'name':
    case 'literal':
      return 'chain';
    case 'nameAndFields':
      return 'options';
    default:
      return assertNever(args);
  }
}

const WORD = /^\w+$/;
const FIELD_PATH = /^\w+(\.\w+)*$/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function literalSource(entry: DecoratorEntry, value: unknown): string {
  if (entry.args.kind !== 'literal') throw new Error(`${entry.name} takes no literal`);
  const { forms } = entry.args;
  const refuse = (): never => {
    throw new Error(`${entry.name} cannot take ${JSON.stringify(value)}`);
  };

  if (typeof value === 'boolean') return forms.includes('boolean') ? String(value) : refuse();
  if (value === null) return forms.includes('null') ? 'null' : refuse();
  if (typeof value === 'number') {
    const form = Number.isInteger(value) ? 'int' : 'float';
    // Exponent and non-finite forms would read back as raw text, not as the number.
    return forms.includes(form) && Number.isFinite(value) && PLAIN_NUMBER.test(String(value))
      ? String(value)
      : refuse();
  }
  // Newlines never survive the token regex, and the parser would silently drop the value.
  if (typeof value === 'string') return forms.includes('string') && !/[\r\n]/.test(value) ? `'${value}'` : refuse();

  return refuse();
}

/** The token for a chain method call, such as `@sort(asc)`. Throws on an argument the shape does not allow. */
export function chainToken(entry: DecoratorEntry, arg: unknown): string {
  const { args, name } = entry;
  switch (args.kind) {
    case 'none':
      return name;
    case 'choice':
      if (arg === undefined) {
        if (args.optional) return name;
        throw new Error(`${name} needs one of ${args.choices.join(', ')}`);
      }
      if (typeof arg !== 'string' || !args.choices.includes(arg)) {
        throw new Error(`${name} takes one of ${args.choices.join(', ')}, got ${JSON.stringify(arg)}`);
      }

      return `${name}(${arg})`;
    case 'name':
      if (typeof arg !== 'string' || !WORD.test(arg))
        throw new Error(`${name} needs a plain name, got ${JSON.stringify(arg)}`);

      return `${name}(${arg})`;
    case 'literal':
      return `${name}(${literalSource(entry, arg)})`;
    case 'nameAndFields':
      throw new Error(`${name} is an options key, not a chain method`);
    default:
      return assertNever(args);
  }
}

/** The token for an options entry, such as `@@index(byCity, [location.city])`. */
export function optionsToken(entry: DecoratorEntry, value: unknown): string {
  const { args, name } = entry;
  switch (args.kind) {
    case 'nameAndFields': {
      const parts = value as { name?: unknown; fields?: unknown; nullsNotDistinct?: unknown } | null;
      const fields = parts?.fields;
      if (typeof parts?.name !== 'string' || !WORD.test(parts.name)) {
        throw new Error(`${name} needs a plain name, got ${JSON.stringify(parts?.name)}`);
      }
      if (
        !Array.isArray(fields) ||
        !fields.length ||
        !fields.every((f) => typeof f === 'string' && FIELD_PATH.test(f))
      ) {
        throw new Error(`${name} needs a non-empty list of field paths, got ${JSON.stringify(fields)}`);
      }

      // `false` is the same as absent; the key exists only on entries that list options
      const option = parts.nullsNotDistinct;
      if (option !== undefined && typeof option !== 'boolean') {
        throw new Error(`${name} nullsNotDistinct must be true or false, got ${JSON.stringify(option)}`);
      }
      if (option && !args.options?.includes('nullsNotDistinct')) {
        throw new Error(`${name} cannot take nullsNotDistinct: it only applies to @@unique`);
      }

      return `${name}(${parts.name}, [${fields.join(', ')}]${option ? ', nullsNotDistinct' : ''})`;
    }
    case 'none':
    case 'choice':
    case 'name':
    case 'literal':
      throw new Error(`${name} is a chain method, not an options key`);
    default:
      return assertNever(args);
  }
}
