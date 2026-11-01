import { CerialGenerationError } from '../../../errors';
import { BUILDER_METHODS } from '../../../parser/builder';
import { DECORATOR_REGISTRY } from '../../../parser/registry';
import type {
  ASTCompositeDirective,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  ExtendsFilter,
} from '../../../types';
import type { DeclarationComments } from './comments';
import { emitElement, emitField, emitVariant } from './field';
import type { EmitContext, ReferenceKind } from './field';
import { arrayOf, objectOf, printCall } from './layout';
import type { Entry, Layout } from './layout';
import { BUILDER_CALLEES, bindingFor, exportStatement, propertyKey } from './names';
import { isForwardRelation, planRelations } from './relation';
import { quote } from './strings';

export interface DeclarationContext {
  /** How a reference to an object, tuple or literal is written; a bare name string when absent. */
  readonly reference?: EmitContext['reference'];
  /** The `const` a declaration is bound to, for `extends` and for its own export; its own name when absent. */
  readonly binding?: (name: string) => string;
  /** The declaration's comments, written into the text where they belong. */
  readonly comments?: DeclarationComments;
}

export interface EmittedDeclaration {
  readonly name: string;
  /** The `const` the declaration is bound to. */
  readonly binding: string;
  /** The statements: a `const` and its export. */
  readonly text: string;
  /** The local names of the builder imports the text uses, such as `model` and `f`. */
  readonly uses: readonly string[];
  /** Differences the TypeScript cannot avoid, each naming the declaration. */
  readonly warnings: readonly string[];
  /** The model's composite directives were regrouped by kind, so its order alone may differ from the source. */
  readonly directiveKindOrder: boolean;
}

const INTEGER_KEY = /^(0|[1-9]\d*)$/;

function referencing(context: DeclarationContext): EmitContext['reference'] {
  const { reference } = context;

  // A relation target is always a bare name: a thunk across a model cycle cannot be inferred
  return (kind: ReferenceKind, name: string) => (kind === 'model' || !reference ? quote(name) : reference(kind, name));
}

function bound(context: DeclarationContext, name: string): string {
  return context.binding ? context.binding(name) : bindingFor(name);
}

function extendsText(
  parent: string | undefined,
  filter: ExtendsFilter | undefined,
  context: DeclarationContext,
  positional: boolean,
): string | undefined {
  if (parent === undefined) return undefined;
  const handle = bound(context, parent);
  if (!filter) return handle;
  const fields = filter.fields.map((field) => (positional && INTEGER_KEY.test(field) ? field : quote(field)));

  return `${handle}.${filter.mode}(${fields.join(', ')})`;
}

function emitted(
  name: string,
  context: DeclarationContext,
  callee: string,
  args: readonly Layout[],
  uses: readonly string[],
  extra: Partial<Pick<EmittedDeclaration, 'warnings' | 'directiveKindOrder'>> & { stray?: readonly string[] } = {},
): EmittedDeclaration {
  const binding = bound(context, name);
  const lead = binding === name ? 'export const ' : 'const ';
  const init = printCall(lead.length + binding.length + ' = '.length, callee, args);
  const above = [...(context.comments?.above ?? []), ...(extra.stray ?? [])];

  return {
    name,
    binding,
    text: [...above, exportStatement(name, binding, init)].join('\n'),
    uses,
    warnings: extra.warnings ?? [],
    directiveKindOrder: extra.directiveKindOrder ?? false,
  };
}

/** The options key a composite directive is written under, such as `index`, read from the method table. */
function optionKey(kind: ASTCompositeDirective['kind']): string {
  const entry = DECORATOR_REGISTRY.get(`@@${kind}`);
  const row = entry && BUILDER_METHODS[entry.constructId];
  const key = typeof row === 'string' ? row.match(/^\{ (\w+) \}/)?.[1] : undefined;
  if (!key) throw new CerialGenerationError(`Cannot write @@${kind} as a builder option: the method table has no key`);

  return key;
}

function directiveLayout(directive: ASTCompositeDirective): Layout {
  return objectOf([
    { key: 'name', value: quote(directive.name) },
    { key: 'fields', value: arrayOf(directive.fields.map(quote)) },
  ]);
}

interface Directives {
  readonly entries: Entry[];
  readonly alternating: boolean;
}

/**
 * Composite directives as options entries. An options object cannot interleave kinds, so a model that
 * alternates (`index`, `unique`, `index`) is grouped by kind, in the order each kind first appeared.
 */
function directiveEntries(directives: readonly ASTCompositeDirective[]): Directives {
  const groups = new Map<ASTCompositeDirective['kind'], ASTCompositeDirective[]>();
  const closed = new Set<string>();
  let alternating = false;
  let last: string | undefined;
  for (const directive of directives) {
    if (directive.kind !== last) {
      if (closed.has(directive.kind)) alternating = true;
      if (last !== undefined) closed.add(last);
      last = directive.kind;
    }
    groups.set(directive.kind, [...(groups.get(directive.kind) ?? []), directive]);
  }
  const entries = [...groups].map(([kind, list]): Entry => {
    const layouts = list.map(directiveLayout);

    return { key: optionKey(kind), value: layouts.length === 1 ? layouts[0]! : arrayOf(layouts) };
  });

  return { entries, alternating };
}

interface FieldEntries {
  readonly entries: Entry[];
  /** Comments of fields whose entry is not written (a derived foreign key), which go above the declaration. */
  readonly stray: string[];
}

function fieldEntries(
  fields: readonly ASTField[],
  declaration: string,
  context: DeclarationContext,
  derivation?: ReturnType<typeof planRelations>,
): FieldEntries {
  const reference = referencing(context);
  const above = context.comments?.fieldAbove;
  const after = context.comments?.fieldAfter;
  const entries: Entry[] = [];
  const placed = new Set<string>();
  fields.forEach((field, index) => {
    if (derivation?.consumed.has(index)) return;
    const derivedForeignKey = derivation?.derived.has(index) || undefined;
    placed.add(field.name);
    entries.push({
      key: propertyKey(field.name),
      value: emitField(field, { declaration, reference, derivedForeignKey }),
      above: above?.get(field.name),
      after: after?.get(field.name),
    });
  });
  const names = new Set([...(above?.keys() ?? []), ...(after?.keys() ?? [])]);
  const stray = [...names].flatMap((name) =>
    placed.has(name) ? [] : [...(above?.get(name) ?? []), ...(after?.get(name) ?? [])],
  );

  return { entries, stray };
}

/** A model as `model('Name', { ... }, { ... })`. */
export function emitModel(node: ASTModel, context: DeclarationContext = {}): EmittedDeclaration {
  const declaration = `model ${node.name}`;
  const derivation = planRelations(node.fields);
  const { entries: directives, alternating } = directiveEntries(node.directives ?? []);
  const parent = extendsText(node.extends, node.extendsFilter, context, false);
  const options: Entry[] = [
    ...(node.abstract ? [{ key: 'abstract', value: 'true' }] : []),
    ...(parent ? [{ key: 'extends', value: parent }] : []),
    ...directives,
  ];
  const { entries, stray } = fieldEntries(node.fields, declaration, context, derivation);
  const args = [quote(node.name), objectOf(entries, true), ...(options.length ? [objectOf(options)] : [])];
  const warnings = alternating
    ? [
        `${declaration} interleaves @@index and @@unique; the TypeScript groups them by kind, which changes only the order of its index definitions`,
      ]
    : [];

  return emitted(node.name, context, BUILDER_CALLEES.model, args, ['model', ...(node.fields.length ? ['f'] : [])], {
    warnings,
    directiveKindOrder: alternating,
    stray,
  });
}

/** An object as `object('Name', { ... })`. */
export function emitObject(node: ASTObject, context: DeclarationContext = {}): EmittedDeclaration {
  const declaration = `object ${node.name}`;
  const relation = node.fields.find((field) => field.type === 'relation' || isForwardRelation(field));
  if (relation) {
    throw new CerialGenerationError(
      `Cannot write ${declaration}, field '${relation.name}', as builder calls: an object cannot hold a relation`,
    );
  }
  const parent = extendsText(node.extends, node.extendsFilter, context, false);
  const { entries, stray } = fieldEntries(node.fields, declaration, context);
  const args = [
    quote(node.name),
    objectOf(entries, true),
    ...(parent ? [objectOf([{ key: 'extends', value: parent }])] : []),
  ];

  return emitted(node.name, context, BUILDER_CALLEES.object, args, ['object', ...(node.fields.length ? ['f'] : [])], {
    stray,
  });
}

/**
 * A tuple as `tuple('Name', ...)`: the record form when every element is named, else the array form with
 * `.named()` on the elements that have a name.
 */
export function emitTuple(node: ASTTuple, context: DeclarationContext = {}): EmittedDeclaration {
  const declaration = `tuple ${node.name}`;
  const reference = referencing(context);
  const keyed = !!node.elements.length && node.elements.every((element) => element.name !== undefined);
  const elements = node.elements.map((element) => emitElement(element, { declaration, reference, keyed }));
  const body = keyed
    ? objectOf(
        elements.map((value, i) => ({ key: propertyKey(node.elements[i]!.name!), value })),
        true,
      )
    : arrayOf(elements);
  const parent = extendsText(node.extends, node.extendsFilter, context, true);
  const args = [quote(node.name), body, ...(parent ? [objectOf([{ key: 'extends', value: parent }])] : [])];

  return emitted(node.name, context, BUILDER_CALLEES.tuple, args, ['tuple', ...(node.elements.length ? ['e'] : [])]);
}

/** A literal as `literal('Name', [variant.string('a'), ...])`. */
export function emitLiteral(node: ASTLiteral, context: DeclarationContext = {}): EmittedDeclaration {
  const declaration = `literal ${node.name}`;
  const reference = referencing(context);
  const variants = node.variants.map((item) => emitVariant(item, { declaration, reference }));
  const parent = extendsText(node.extends, node.extendsFilter, context, false);
  const args = [
    quote(node.name),
    arrayOf(variants),
    ...(parent ? [objectOf([{ key: 'extends', value: parent }])] : []),
  ];

  return emitted(node.name, context, BUILDER_CALLEES.literal, args, [
    'literal',
    ...(variants.length ? ['variant'] : []),
  ]);
}

/** An enum as `enumeration('Name', ['A', 'B'])`. */
export function emitEnum(node: ASTEnum, context: DeclarationContext = {}): EmittedDeclaration {
  const parent = extendsText(node.extends, node.extendsFilter, context, false);
  const args = [
    quote(node.name),
    arrayOf(node.values.map(quote)),
    ...(parent ? [objectOf([{ key: 'extends', value: parent }])] : []),
  ];

  return emitted(node.name, context, BUILDER_CALLEES.enum, args, [BUILDER_CALLEES.enum]);
}
