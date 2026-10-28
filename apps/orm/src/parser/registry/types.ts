/**
 * Entry types for the decorator and field-type registry.
 *
 * Decorators and field types are data here, the way `query/filters/registry.ts` holds operators.
 * The parser's dispatch, the extension's completion and hover, the builder's types and the generated
 * documentation all read these entries instead of keeping lists of their own.
 */

import type { ASTCompositeDirective, ASTDecorator, SchemaDecorator, SchemaFieldType, SourceRange } from '../../types';

/**
 * A decorator as written in a schema: `@` for a field decorator, `@@` for a model-level directive.
 * The sigil keeps `@index` (on a field) and `@@index` (on a model) distinct.
 */
export type DecoratorName = `@${SchemaDecorator}` | `@@${ASTCompositeDirective['kind']}`;

/** Where a decorator may appear. Read by the validators, completion and the builder's chain methods. */
export type DecoratorTarget = 'modelField' | 'objectField' | 'tupleElement' | 'model';

/**
 * The value forms `@default` and `@defaultAlways` accept: `true`/`false`, `null`, an integer, a float,
 * a quoted string, or `raw` for any other text kept verbatim (a duration such as `1h30m`).
 */
export type LiteralForm = 'boolean' | 'null' | 'int' | 'float' | 'string' | 'raw';

/**
 * What a decorator accepts between its parentheses. `ASTDecorator` carries one optional value, so every
 * field decorator is zero-argument or one-value; `nameAndFields` belongs to the model-level directives,
 * which produce an `ASTCompositeDirective` instead. A richer shape is a new member of this union.
 * Read by the parser (what to accept), the builder (the argument type) and hover (the signature).
 */
export type ArgumentShape =
  /** `@id`: no parentheses. */
  | { readonly kind: 'none' }
  /** `@onDelete(Cascade)`, `@sort(asc)`: one word from a closed set; `optional` also allows `@sort` and `@sort()`. */
  | { readonly kind: 'choice'; readonly choices: readonly string[]; readonly optional: boolean }
  /** `@field(authorId)`, `@model(User)`, `@key(name)`: one bare identifier naming a field, model or key. */
  | { readonly kind: 'name' }
  /** `@default(value)`: one literal, required. */
  | { readonly kind: 'literal'; readonly forms: readonly LiteralForm[] }
  /** `@@index(name, [a, b.c])`: an index name and a list of field paths, dotted into nested objects. */
  | { readonly kind: 'nameAndFields' };

/** Turns a decorator token such as `@sort(asc)` into its AST node. */
export type DecoratorHandler = (token: string, range: SourceRange) => ASTDecorator | ASTCompositeDirective;

/** One decorator: everything the four consumers need to know about it. */
export interface DecoratorEntry {
  /** The decorator as written in a schema, sigil included. */
  readonly name: DecoratorName;
  readonly args: ArgumentShape;
  /** Where it is legal. Never empty. */
  readonly targets: readonly DecoratorTarget[];
  /** Decorators that cannot share a target with this one; the builder removes them from the chain. */
  readonly excludes: readonly DecoratorName[];
  /** The one line the editor shows on hover. */
  readonly description: string;
  /** Produces the AST node from the written token. */
  readonly parse: DecoratorHandler;
}

/** One field type: what dispatch, completion and hover need. */
export interface FieldTypeEntry {
  /** The type as written in a schema, such as `String` or `Record`. */
  readonly name: string;
  /** The type the parser records in the AST. */
  readonly fieldType: SchemaFieldType;
  /** The one line the editor shows on hover. */
  readonly description: string;
  /**
   * Whether a type token names this type. `token` is the token as written and `base` is the same token
   * with its first `[]` removed. Most types match on `base`; `Record` and `Relation` read `token`
   * because their array form is part of what they accept.
   */
  readonly match: (token: string, base: string) => boolean;
}
