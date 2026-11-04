/**
 * Where each parity manifest construct is written in the builder.
 *
 * `BUILDER_METHODS` is typed `Record<ConstructId, BuilderMethod>`, so a manifest entry with no row fails
 * `bunx tsc --noEmit`. Decorator and field-type rows come from the registries through each entry's
 * `constructId`, so a new registry entry needs no edit here; `HAND_ROWS` covers the constructs the registries
 * do not reach. Rows naming an AST union (`LITERAL_VARIANT_METHODS`, `DECLARATION_METHODS`) are typed over
 * that union, so widening it is a compile error here as well as in `parity/ast-cross-check.ts`.
 *
 * A route is a string the method-table test resolves against the real builder, so a stale row fails:
 * - `model`, `BUILDER_RANGE`: an export of the builder barrel
 * - `f.record`, `e.tuple`, `variant.string`: a function on a factory object
 * - `.optional`, `.nullable@element`: a method on a builder, narrowed to one probe with `@`
 * - `!.optional@element`: a method the builder must NOT have, how a rejected form is refused
 * - `{ extends }@object`, `{ index }`: a key of the declaration's options
 */

import type { ConstructId, ParityEntry, REGISTRY_FAMILIES } from '../../parity';
import type { SchemaAST } from '../../types';
import type { ASTLiteralVariantKind } from '../../types/parser.types';
import { DECORATOR_REGISTRY, FIELD_TYPE_REGISTRY } from '../registry';
import type { DecoratorEntry } from '../registry';
import { bucketOf } from './argument-source';
import { bareName } from './entries';
import { NO_PUBLIC_METHOD, RELATION_ONLY_METHOD } from './exposure';
import type { ElementFactories } from './tuple';
import { f } from './field';
import type { FieldFactories } from './field';
import type { variant } from './literal';

/** The builders a method route can be narrowed to. A declaration kind names a handle of that kind. */
export type Probe =
  | 'field'
  | 'relation'
  | 'reverse'
  | 'element'
  | 'model'
  | 'object'
  | 'tuple'
  | 'enum'
  | 'literal'
  | 'filtered';
export type DeclarationKind = 'model' | 'object' | 'tuple' | 'enum' | 'literal';

/** An export of the builder barrel, as `import { name } from '.../builder'` spells it. */
export type BuilderExport =
  | 'model'
  | 'object'
  | 'tuple'
  | 'enum'
  | 'literal'
  | 'materialise'
  | 'loadDeclarations'
  | 'BUILDER_RANGE'
  | 'modelNode'
  | 'tupleNode'
  | 'literalNode'
  | 'fieldNode';

export type BuilderRoute =
  | BuilderExport
  | `f.${keyof FieldFactories}`
  | `e.${keyof ElementFactories}`
  | `variant.${keyof typeof variant}`
  | `.${string}`
  | `.${string}@${Probe}`
  | `!.${string}@${Probe}`
  | `{ ${string} }`
  | `{ ${string} }@${DeclarationKind}`;

/**
 * A direct route, or a route plus how the construct is reached through it, or `outside` for a rule the
 * builder does not own: a later pipeline stage enforces it on the materialised AST.
 */
export type BuilderMethod =
  | BuilderRoute
  | { readonly path: BuilderRoute; readonly how: string }
  | { readonly outside: string };

type RegistryFamily = (typeof REGISTRY_FAMILIES)[number];
type InFamily = Extract<ParityEntry, { readonly family: RegistryFamily }>;
/** Entries a registry entry claims through its `constructId`; the rest of the family is hand-written. */
export type RegistryReachId = Exclude<InFamily, { readonly outOfReach: string }>['id'];
type HandId = Exclude<ConstructId, RegistryReachId>;

const how = (path: BuilderRoute, text: string): BuilderMethod => ({ path, how: text });

export const LITERAL_VARIANT_METHODS: Record<ASTLiteralVariantKind, BuilderMethod> = {
  string: 'variant.string',
  int: 'variant.int',
  float: 'variant.float',
  bool: 'variant.bool',
  broadType: 'variant.broadType',
  tupleRef: 'variant.tuple',
  objectRef: 'variant.object',
  literalRef: 'variant.literal',
};

export const DECLARATION_METHODS: Record<Exclude<keyof SchemaAST, 'source'>, BuilderMethod> = {
  models: 'model',
  objects: 'object',
  tuples: 'tuple',
  literals: 'literal',
  enums: 'enum',
};

const RANGE = 'every node is built with the placeholder range the factories take';
const ARRAY = '.array@field';
const ID_ARITY = 'an arity of f.record, the type list is its arguments';
const ELEMENT_ONLY = 'a tuple element takes it from the element builder';
const AFTER_MATERIALISE = 'enforced on the materialised AST by a later stage, not by the builder';

const HAND_ROWS: Record<HandId, BuilderMethod> = {
  'decl.model': DECLARATION_METHODS.models,
  'decl.abstract-model': '{ abstract }',
  'decl.object': DECLARATION_METHODS.objects,
  'decl.tuple': DECLARATION_METHODS.tuples,
  'decl.enum': DECLARATION_METHODS.enums,
  'decl.literal': DECLARATION_METHODS.literals,
  'decl.ast-assembly': 'materialise',

  'fidelity.range.model': how('BUILDER_RANGE', RANGE),
  'fidelity.range.object': how('BUILDER_RANGE', RANGE),
  'fidelity.range.tuple': how('BUILDER_RANGE', RANGE),
  'fidelity.range.enum': how('BUILDER_RANGE', RANGE),
  'fidelity.range.literal': how('BUILDER_RANGE', RANGE),
  'fidelity.range.field': how('BUILDER_RANGE', RANGE),
  'fidelity.range.decorator': how('BUILDER_RANGE', RANGE),
  'fidelity.range.directive': how('BUILDER_RANGE', RANGE),
  'fidelity.omit-falsy': how('fieldNode', 'nodes are built through the AST factories, never object literals'),
  'fidelity.nullable-flag.field': how(
    '.nullable@field',
    'the method pushes the decorator and the factory derives the flag',
  ),
  'fidelity.nullable-flag.element': how(
    '.nullable@element',
    'the method pushes the decorator and the factory derives the flag',
  ),
  'fidelity.model-directives-present': how('modelNode', 'built through createModel, which always writes directives'),
  'fidelity.field-decorators-present': how('fieldNode', 'built through createField, which always writes decorators'),
  'fidelity.literal-variant-shape': how('literalNode', 'variants are built to the union shapes by variant.*'),
  'fidelity.element-decorators-omitted': how(
    'tupleNode',
    'built through createTupleElement, which omits an empty decorator list',
  ),

  'recordid.int': how('f.record', ID_ARITY),
  'recordid.number': how('f.record', ID_ARITY),
  'recordid.string': how('f.record', ID_ARITY),
  'recordid.uuid': how('f.record', ID_ARITY),
  'recordid.union': how('f.record', ID_ARITY),
  'recordid.tuple': how('f.record', 'a tuple handle, thunk or name is a legal id type'),
  'recordid.object': how('f.record', 'an object handle, thunk or name is a legal id type'),
  'recordid.invalid-primitive-rejected': how('f.record', 'the id type list is constrained at the type level'),

  'complex.record-array': how('f.record', 'followed by .array()'),
  'complex.relation-array': how('f.relation', 'followed by .array()'),
  'ref.object': 'f.object',
  'ref.tuple': 'f.tuple',
  'ref.literal': 'f.literal',
  'ref.enum': how('f.enum', 'an enum is a literal to the parser, so the same field'),

  'array.string': how(ARRAY, 'f.string().array()'),
  'array.email': how(ARRAY, 'f.email().array()'),
  'array.int': how(ARRAY, 'f.int().array()'),
  'array.float': how(ARRAY, 'f.float().array()'),
  'array.number': how(ARRAY, 'f.number().array()'),
  'array.bool': how(ARRAY, 'f.bool().array()'),
  'array.date': how(ARRAY, 'f.date().array()'),
  'array.uuid': how(ARRAY, 'f.uuid().array()'),
  'array.duration': how(ARRAY, 'f.duration().array()'),
  'array.decimal': how(ARRAY, 'f.decimal().array()'),
  'array.bytes': how(ARRAY, 'f.bytes().array()'),
  'array.geometry': how(ARRAY, 'f.geometry().array()'),
  'array.any': how(ARRAY, 'f.any().array()'),
  'array.object': how(ARRAY, 'f.object(ref).array()'),
  'array.tuple': how(ARRAY, 'f.tuple(ref).array()'),
  'array.literal': how(ARRAY, 'f.literal(ref).array()'),
  'array.enum': how(ARRAY, 'f.enum(ref).array()'),
  'array.optional-rejected': { outside: `Type[]? is ${AFTER_MATERIALISE}` },

  'decorator.onDelete.Cascade': how('.onDelete@relation', ".onDelete('Cascade')"),
  'decorator.onDelete.SetNull': how('.onDelete@relation', ".onDelete('SetNull')"),
  'decorator.onDelete.SetNone': how('.onDelete@relation', ".onDelete('SetNone')"),
  'decorator.onDelete.Restrict': how('.onDelete@relation', ".onDelete('Restrict')"),
  'decorator.onDelete.NoAction': how('.onDelete@relation', ".onDelete('NoAction')"),
  'decorator.sort.false': how('.sort@field', '.sort(false)'),
  'decorator.unique.nulls-not-distinct': how('.unique@field', ".unique('nullsNotDistinct')"),

  'directive.dot-notation': how('{ index }', 'a field path is a string that may be dotted, in either directive'),
  'directive.index.primitive': how('{ index }', 'a list of primitive field names'),
  'directive.index.object': how('{ index }', 'a list of dotted object sub-field paths'),
  'directive.index.record': how('{ index }', 'a list of record field names'),
  'directive.index.primitive+object': how('{ index }', 'primitive names and dotted paths in one list'),
  'directive.index.primitive+record': how('{ index }', 'primitive and record names in one list'),
  'directive.index.object+record': how('{ index }', 'dotted paths and record names in one list'),
  'directive.unique.nulls-not-distinct': how('{ unique }', 'nullsNotDistinct: true on the entry'),
  'directive.unique.primitive': how('{ unique }', 'a list of primitive field names'),
  'directive.unique.object': how('{ unique }', 'a list of dotted object sub-field paths'),
  'directive.unique.record': how('{ unique }', 'a list of record field names'),
  'directive.unique.primitive+object': how('{ unique }', 'primitive names and dotted paths in one list'),
  'directive.unique.primitive+record': how('{ unique }', 'primitive and record names in one list'),
  'directive.unique.object+record': how('{ unique }', 'dotted paths and record names in one list'),

  'modifier.optional.model-field': '.optional@field',
  'modifier.optional.object-field': how('.optional@field', 'the same builder serves the fields of object()'),
  'modifier.private.model-field': '.private@field',
  'modifier.private.object-field': how('.private@field', 'the same builder serves the fields of object()'),
  'modifier.private.tuple-element': '.private@element',
  'modifier.array': '.array@field',

  'literal.variant.string': LITERAL_VARIANT_METHODS.string,
  'literal.variant.int': LITERAL_VARIANT_METHODS.int,
  'literal.variant.float': LITERAL_VARIANT_METHODS.float,
  'literal.variant.bool': LITERAL_VARIANT_METHODS.bool,
  'literal.variant.broadType': LITERAL_VARIANT_METHODS.broadType,
  'literal.broad.String': how('variant.broadType', "variant.broadType('String')"),
  'literal.broad.Int': how('variant.broadType', "variant.broadType('Int')"),
  'literal.broad.Float': how('variant.broadType', "variant.broadType('Float')"),
  'literal.broad.Bool': how('variant.broadType', "variant.broadType('Bool')"),
  'literal.broad.Date': how('variant.broadType', "variant.broadType('Date')"),
  'literal.variant.tupleRef': LITERAL_VARIANT_METHODS.tupleRef,
  'literal.variant.objectRef': LITERAL_VARIANT_METHODS.objectRef,
  'literal.variant.literalRef': LITERAL_VARIANT_METHODS.literalRef,
  'literal.variant.literalRef.enum': how('variant.literal', 'an enum handle is a literal reference'),

  'tuple.element.positional': how('tuple', 'elements given as an array'),
  'tuple.element.named': how('tuple', 'elements given as a record keyed by name'),
  'tuple.element.nullable': '.nullable@element',
  'tuple.element.default': how('.default@element', ELEMENT_ONLY),
  'tuple.element.defaultAlways': how('.defaultAlways@element', ELEMENT_ONLY),
  'tuple.element.createdAt': how('.createdAt@element', ELEMENT_ONLY),
  'tuple.element.updatedAt': how('.updatedAt@element', ELEMENT_ONLY),
  'tuple.element.nested': 'e.tuple',
  'tuple.element.object': 'e.object',
  'tuple.element.literal': 'e.literal',
  'tuple.element.optional-rejected': how('!.optional@element', 'an element builder has no optional method'),

  'extends.model': '{ extends }@model',
  'extends.object': '{ extends }@object',
  'extends.tuple': '{ extends }@tuple',
  'extends.enum': '{ extends }@enum',
  'extends.literal': '{ extends }@literal',
  'extends.pick.model': '.pick@model',
  'extends.pick.object': '.pick@object',
  'extends.pick.tuple': '.pick@tuple',
  'extends.pick.enum': '.pick@enum',
  'extends.pick.literal': '.pick@literal',
  'extends.omit.model': '.omit@model',
  'extends.omit.object': '.omit@object',
  'extends.omit.tuple': '.omit@tuple',
  'extends.omit.enum': '.omit@enum',
  'extends.omit.literal': '.omit@literal',
  'extends.tuple.pick-index': how('.pick@tuple', 'a position is passed as a number'),
  'extends.tuple.omit-index': how('.omit@tuple', 'a position is passed as a number'),
  'extends.tuple.pick-name': how('.pick@tuple', 'a named element is passed by name'),
  'extends.tuple.omit-name': how('.omit@tuple', 'a named element is passed by name'),
  'extends.literal.identity-quoted': how('.pick@literal', 'a string variant is named by its value'),
  'extends.literal.identity-bare': how('.pick@literal', 'an int, bool, broad type or ref variant is named bare'),
  'extends.mixed-rejected': how('!.omit@filtered', 'a filtered reference has neither pick nor omit'),
  'extends.chain.pick-then-omit': how('.omit@model', 'a child declared with a pick is itself extendable'),
  'extends.chain.omit-then-pick': how('.pick@model', 'a child declared with an omit is itself extendable'),

  'validation.type-constraints': how('model', 'the rules marked T are encoded in the builder types'),
  'validation.extends-raw-ast': { outside: 'validateExtends runs on the raw AST after materialise' },
  'validation.resolved-types': { outside: 'validateResolvedTypes runs after resolveInheritance' },
  'validation.schema-resolved': { outside: 'validateSchema runs on the resolved AST' },
  'validation.parser-validate-schema': { outside: 'a decision about the parser, not a builder route' },

  'config.discovery': { outside: 'schema discovery in the CLI finds the modules before the builder runs' },
  'config.config-fields': { outside: 'cerial.config.ts is read by the CLI, not the builder' },
  'config.client-class-name': { outside: 'derived from the schema entry name by the CLI' },
  'config.forward-references': how('materialise', 'a thunk or name resolves in one pass after every module loads'),
  'config.entry-boundary': how('materialise', 'resolution is scoped to the declarations of one schema entry'),
  'config.combined-ast-seam': how('loadDeclarations', 'the loaded declarations are the hand-off to the combined AST'),
};

/** The route a registry decorator gets. `@model` is written by the relation factory from its argument. */
function decoratorRoute(entry: DecoratorEntry): BuilderMethod {
  if (NO_PUBLIC_METHOD.some((n) => n === entry.name))
    return how('f.relation', 'the relation factory writes it from its target argument');
  const name = bareName(entry.name);
  if (bucketOf(entry.args) === 'options') return `{ ${name} }`;
  if (RELATION_ONLY_METHOD.some((n) => n === entry.name)) return `.${name}@relation`;

  return entry.targets.includes('modelField') || entry.targets.includes('objectField')
    ? `.${name}@field`
    : `.${name}@element`;
}

/** Rows for the registry's entries, keyed by the manifest id each one claims. */
function registryRows(): Record<RegistryReachId, BuilderMethod> {
  const rows: Record<string, BuilderMethod> = {};
  for (const entry of DECORATOR_REGISTRY.values()) rows[entry.constructId] = decoratorRoute(entry);
  for (const entry of FIELD_TYPE_REGISTRY.values()) {
    if (!(entry.fieldType in f)) throw new Error(`No field factory for the '${entry.fieldType}' field type`);
    rows[entry.constructId] = `f.${entry.fieldType}` as BuilderRoute;
  }

  // The registry cross-check test pins that these keys are exactly the in-reach manifest ids
  return rows as Record<RegistryReachId, BuilderMethod>;
}

export const BUILDER_METHODS: Record<ConstructId, BuilderMethod> = { ...registryRows(), ...HAND_ROWS };
