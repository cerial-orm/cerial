import { CerialGenerationError } from '../../../errors';
import type { ConstructId } from '../../../parity';
import {
  BUILDER_METHODS,
  LITERAL_VARIANT_METHODS,
  RELATION_ONLY_METHOD,
  createChain,
  e,
  f,
  variant,
} from '../../../parser/builder';
import type { BuilderKind } from '../../../parser/builder';
import { DECORATOR_REGISTRY } from '../../../parser/registry';
import type { DecoratorEntry, DecoratorTarget } from '../../../parser/registry';
import type { ASTDecorator, ASTField, ASTLiteralVariant, ASTTupleElement } from '../../../types';
import { quote } from './strings';

export type ReferenceKind = 'object' | 'tuple' | 'literal' | 'model';

export interface EmitContext {
  /** The declaration being emitted, such as `model User`, named in every refusal. */
  readonly declaration: string;
  /** How a reference to another declaration is written; a bare name string when absent. */
  readonly reference?: (kind: ReferenceKind, name: string) => string;
  /** A forward relation whose foreign key the builder derives, so no `.field(...)` is written. */
  readonly derivedForeignKey?: boolean;
  /** A tuple element written under its record key, so `.named(...)` would be refused. */
  readonly keyed?: boolean;
}

type Factory = (...args: unknown[]) => object;
type ChainStep = (arg?: unknown) => { decorators(): readonly object[] };

interface Placed {
  readonly decorator: ASTDecorator;
  readonly entry: DecoratorEntry;
  /** The table route; a factory route means the factory writes the decorator from its argument. */
  readonly route: string | undefined;
  readonly method: string | undefined;
}

function refuse(ctx: EmitContext, subject: string, reason: string): never {
  throw new CerialGenerationError(`Cannot write ${ctx.declaration}, ${subject}, as builder calls: ${reason}`);
}

/** The route a table row names, or undefined for a row that is `outside` the builder. */
function routeOf(id: ConstructId): string | undefined {
  const row = BUILDER_METHODS[id];
  if (typeof row === 'string') return row;

  return 'path' in row ? row.path : undefined;
}

/** `.optional@field` gives `optional`; anything that is not a method route gives undefined. */
function methodOf(route: string | undefined): string | undefined {
  return route?.match(/^\.(\w+)(?:@\w+)?$/)?.[1];
}

const OPTIONAL = methodOf(routeOf('modifier.optional.model-field'));
const ARRAY = methodOf(routeOf('modifier.array'));
const FIELD_PRIVATE = methodOf(routeOf('modifier.private.model-field'));
const ELEMENT_PRIVATE = methodOf(routeOf('modifier.private.tuple-element'));
/** The array form of a tuple names an element with this method; the method table has no row for it. */
const NAMED = 'named';
const REVERSE = 'reverse';

const FACTORY_ROUTES = new Set(
  Object.values(BUILDER_METHODS).map((row) => (typeof row === 'string' ? row : 'path' in row ? row.path : undefined)),
);

function has(builder: object, method: string | undefined): boolean {
  return method !== undefined && typeof (builder as Record<string, unknown>)[method] === 'function';
}

/** A builder made with placeholder arguments, so the methods the real one offers can be read off it. */
function shadowOf(factories: object, name: string): object {
  const make = (factories as Record<string, Factory>)[name]!;

  return make(...Array.from({ length: make.length }, () => '_'));
}

function referenceText(ctx: EmitContext, kind: ReferenceKind, name: string): string {
  return ctx.reference ? ctx.reference(kind, name) : quote(name);
}

/** The factory argument a reference-typed node carries, or none. */
function referenceArgs(
  node: { objectName?: string; tupleName?: string; literalName?: string },
  type: string,
  ctx: EmitContext,
  subject: string,
): string[] {
  const found = (
    [
      ['object', node.objectName],
      ['tuple', node.tupleName],
      ['literal', node.literalName],
    ] as const
  ).filter((pair): pair is readonly [Exclude<ReferenceKind, 'model'>, string] => pair[1] !== undefined);
  if (found.length > 1)
    refuse(ctx, subject, `it names more than one declaration (${found.map((p) => p[1]).join(', ')})`);
  const [pair] = found;
  if (pair && pair[0] !== type) refuse(ctx, subject, `a ${type} carries a ${pair[0]} name '${pair[1]}'`);

  return pair ? [referenceText(ctx, pair[0], pair[1])] : [];
}

function argText(arg: unknown): string {
  if (arg === undefined) return '';
  if (typeof arg === 'string') return quote(arg);

  return Object.is(arg, -0) ? '-0' : String(arg);
}

function chainTargetOf(target: DecoratorTarget, kind: BuilderKind): (method: string) => ChainStep | undefined {
  const chain = createChain(target as 'modelField', { kind }) as unknown as Record<string, ChainStep | undefined>;

  return (method) => chain[method];
}

/** The argument text that makes the real chain method produce the decorator's own value. */
function chainArgument(
  step: ChainStep,
  entry: DecoratorEntry,
  decorator: ASTDecorator,
): { readonly text: string } | undefined {
  const { args } = entry;
  const candidates: unknown[] =
    args.kind === 'none'
      ? [undefined]
      : args.kind === 'choice'
        ? [...(args.optional ? [undefined] : []), ...args.choices]
        : [decorator.value];
  for (const candidate of candidates) {
    try {
      const [node] = step(candidate).decorators();
      if (node && 'type' in node && Object.is((node as ASTDecorator).value, decorator.value))
        return { text: argText(candidate) };
    } catch {
      // The method refuses this argument; the next candidate may be the spelling it accepts
    }
  }

  return undefined;
}

/**
 * Order so each decorator is still offered after the ones before it; null when two exclude each other.
 * The result is a permutation, so the decorator list compares equal as a set.
 */
export function chainOrder<T extends { readonly entry: Pick<DecoratorEntry, 'name' | 'excludes'> }>(
  items: readonly T[],
): T[] | null {
  const remaining = [...items];
  const ordered: T[] = [];
  while (remaining.length) {
    const next = remaining.findIndex((candidate) =>
      remaining.every((other) => other === candidate || !candidate.entry.excludes.includes(other.entry.name)),
    );
    if (next < 0) return null;
    ordered.push(...remaining.splice(next, 1));
  }

  return ordered;
}

function placeDecorators(decorators: readonly ASTDecorator[], ctx: EmitContext, subject: string): Placed[] {
  const placed: Placed[] = [];
  for (const decorator of decorators) {
    const entry = DECORATOR_REGISTRY.get(`@${decorator.type}`);
    if (!entry) refuse(ctx, subject, `decorator @${decorator.type} is not in the decorator registry`);
    const route = routeOf(entry.constructId);
    placed.push({ decorator, entry, route, method: methodOf(route) });
  }

  return placed;
}

function chainCalls(
  placed: readonly Placed[],
  shadow: object,
  target: DecoratorTarget,
  kind: BuilderKind,
  ctx: EmitContext,
  subject: string,
): string {
  const stepOf = chainTargetOf(target, kind);
  const ordered = chainOrder(placed);
  if (!ordered) {
    refuse(
      ctx,
      subject,
      `decorators ${placed.map((p) => p.entry.name).join(', ')} exclude one another, so no chain order type-checks`,
    );
  }

  return ordered
    .map(({ decorator, entry, route, method }) => {
      if (method === undefined) {
        refuse(ctx, subject, `decorator ${entry.name} has no chain method (${route ?? 'outside the builder'})`);
      }
      const step = stepOf(method);
      if (!step || !has(shadow, method)) refuse(ctx, subject, `decorator ${entry.name} has no builder method here`);
      const arg = chainArgument(step, entry, decorator);
      if (!arg)
        refuse(
          ctx,
          subject,
          `decorator ${entry.name} value ${JSON.stringify(decorator.value)} cannot be passed to .${method}()`,
        );

      return `.${method}(${arg.text})`;
    })
    .join('');
}

/** Whether a modifier flag has a method on this builder; a flag the builder cannot write is refused. */
function modifier(
  flag: boolean | undefined,
  method: string | undefined,
  shadow: object,
  ctx: EmitContext,
  subject: string,
  what: string,
): string {
  if (!flag) return '';
  if (!has(shadow, method)) refuse(ctx, subject, `${what} has no builder method here`);

  return `.${method}()`;
}

/** A field as the builder expression that rebuilds it, such as `f.string().optional().unique()`. */
export function emitField(field: ASTField, ctx: EmitContext): string {
  const subject = `field '${field.name}'`;
  if (!FACTORY_ROUTES.has(`f.${field.type}`) || !Object.hasOwn(f, field.type)) {
    refuse(ctx, subject, `type ${field.type} has no field factory`);
  }

  const placed = placeDecorators(field.decorators, ctx, subject);
  let factory: string = field.type;
  let args: string[];
  const factoryArg = placed.filter((p) => p.route?.startsWith('f.'));
  const remaining = placed.filter((p) => !factoryArg.includes(p));
  if (factoryArg.length) {
    const owner = factoryArg[0]!;
    if (factoryArg.length > 1 || owner.route !== `f.${factory}`) {
      refuse(ctx, subject, `decorator ${owner.entry.name} is written by f.${factory}'s argument, not here`);
    }
    if (typeof owner.decorator.value !== 'string')
      refuse(ctx, subject, `decorator ${owner.entry.name} has no target name`);
    args = [referenceText(ctx, 'model', owner.decorator.value as string)];
    const forward =
      ctx.derivedForeignKey || remaining.some((p) => RELATION_ONLY_METHOD.some((n) => n === p.entry.name));
    if (!forward) {
      if (!Object.hasOwn(f, REVERSE)) refuse(ctx, subject, 'the reverse side of a relation has no factory');
      factory = REVERSE;
    }
  } else {
    args = field.recordIdTypes ? field.recordIdTypes.map(quote) : referenceArgs(field, field.type, ctx, subject);
  }
  const make = (f as unknown as Record<string, Factory>)[factory]!;
  if (!args.length && make.length) refuse(ctx, subject, `f.${factory} needs an argument and the field names none`);

  const shadow = shadowOf(f, factory);
  const decorators = remaining.filter(
    (p) => !(ctx.derivedForeignKey && RELATION_ONLY_METHOD.some((n) => n === p.entry.name)),
  );
  const kind: BuilderKind = factory === REVERSE || factory === 'relation' ? 'relation' : 'plain';

  const base = `f.${factory}(${args.join(', ')})`;
  const optional = modifier(field.isOptional, OPTIONAL, shadow, ctx, subject, 'an optional marker');
  const array = modifier(field.isArray, ARRAY, shadow, ctx, subject, 'an array marker');
  const chain = chainCalls(decorators, shadow, 'modelField', kind, ctx, subject);
  const hidden = modifier(field.isPrivate, FIELD_PRIVATE, shadow, ctx, subject, '!!private');

  return `${base}${optional}${array}${chain}${hidden}`;
}

/** A tuple element as the builder expression that rebuilds it, such as `e.float().nullable().named('lat')`. */
export function emitElement(element: ASTTupleElement, ctx: EmitContext): string {
  const subject = element.name === undefined ? `a ${element.type} element` : `element '${element.name}'`;
  if (!Object.hasOwn(e, element.type)) refuse(ctx, subject, `type ${element.type} has no element factory`);
  const args = referenceArgs(element, element.type, ctx, subject);
  const make = (e as unknown as Record<string, Factory>)[element.type]!;
  if (!args.length && make.length)
    refuse(ctx, subject, `e.${element.type} needs an argument and the element names none`);

  const shadow = shadowOf(e, element.type);
  const placed = placeDecorators(element.decorators ?? [], ctx, subject);
  const named = element.name !== undefined && !ctx.keyed ? `.${NAMED}(${quote(element.name)})` : '';
  if (named && !has(shadow, NAMED)) refuse(ctx, subject, 'an element name has no builder method here');

  const base = `e.${element.type}(${args.join(', ')})`;
  const optional = modifier(element.isOptional, OPTIONAL, shadow, ctx, subject, 'an optional marker');
  const chain = chainCalls(placed, shadow, 'tupleElement', 'plain', ctx, subject);
  const hidden = modifier(element.isPrivate, ELEMENT_PRIVATE, shadow, ctx, subject, '!!private');

  return `${base}${optional}${chain}${hidden}${named}`;
}

/** A literal variant as the `variant.*` call that rebuilds it. */
export function emitVariant(node: ASTLiteralVariant, ctx: EmitContext): string {
  const subject = `variant of kind ${node.kind}`;
  const route = LITERAL_VARIANT_METHODS[node.kind];
  const method = typeof route === 'string' ? route.match(/^variant\.(\w+)$/)?.[1] : undefined;
  if (method === undefined || !Object.hasOwn(variant, method))
    refuse(ctx, subject, 'no variant factory is routed for it');

  switch (node.kind) {
    case 'string':
      return `variant.${method}(${quote(node.value)})`;
    case 'int':
      if (!Number.isInteger(node.value)) refuse(ctx, subject, `${node.value} is not an integer`);

      return `variant.${method}(${argText(node.value)})`;
    case 'float':
      if (!Number.isFinite(node.value)) refuse(ctx, subject, `${node.value} is not a finite number`);

      return `variant.${method}(${argText(node.value)})`;
    case 'bool':
      return `variant.${method}(${String(node.value)})`;
    case 'broadType':
      return `variant.${method}(${quote(node.typeName)})`;
    case 'tupleRef':
      return `variant.${method}(${referenceText(ctx, 'tuple', node.tupleName)})`;
    case 'objectRef':
      return `variant.${method}(${referenceText(ctx, 'object', node.objectName)})`;
    case 'literalRef':
      return `variant.${method}(${referenceText(ctx, 'literal', node.literalName)})`;
    default:
      return refuse(ctx, subject, 'no emitter handles this kind');
  }
}
