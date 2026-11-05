import { CerialGenerationError } from '../../errors';
import type {
  ASTCompositeDirective,
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  Origin,
  SchemaAST,
} from '../../types';
import { IDENTIFIER_PATTERN } from '../tokenizer';
import { createSchemaAST } from '../types/ast';
import { enumNode, isEnumHandle } from './enum';
import { isLiteralHandle, literalNode } from './literal';
import { isModelHandle, modelNode } from './model';
import { isObjectHandle, objectNode } from './object';
import { declarationNumber } from './shared-state';
import { isTupleHandle, tupleNode } from './tuple';

/** One exported declaration and where it came from. `handle` is what `model()`, `object()` and the like returned. */
export interface ExportedDeclaration {
  readonly handle: object;
  /** The module file the export lives in. */
  readonly module: string;
  readonly exportName: string;
}

type ReferenceKind = 'literal' | 'object' | 'tuple';

/** The order the parser tries a name in a field position: literal (enums included), object, tuple. */
const FIELD_ORDER: readonly ReferenceKind[] = ['literal', 'object', 'tuple'];

/** The order it tries a bare name as a literal variant: literal, tuple, object. */
const VARIANT_ORDER: readonly ReferenceKind[] = ['literal', 'tuple', 'object'];

/** Names declared outside the declarations handed to `materialise`, such as the `.cerial` files of a mixed entry. */
export type KnownNames = { readonly [K in ReferenceKind]?: Iterable<string> };

type Kind = 'model' | ReferenceKind | 'enum';

interface Placed extends ExportedDeclaration {
  readonly kind: Kind;
  readonly name: string;
}

interface Context {
  readonly names: Record<ReferenceKind, ReadonlySet<string>>;
  readonly entry: string;
}

function refuse(message: string, cause?: unknown): CerialGenerationError {
  return new CerialGenerationError(message, cause === undefined ? undefined : { cause });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** An export name a generated import can bind: an identifier, or `default`, which is imported under an alias */
export function isImportableExportName(name: string): boolean {
  return name === 'default' || IDENTIFIER_PATTERN.test(name);
}

/** Importable names before the rest, even across modules, then module and name, so a bad re-export never wins */
function byPlace(a: ExportedDeclaration, b: ExportedDeclaration): number {
  return (
    Number(isImportableExportName(b.exportName)) - Number(isImportableExportName(a.exportName)) ||
    compare(a.module, b.module) ||
    compare(a.exportName, b.exportName)
  );
}

/** Within one module: the order the declarations ran in, which is the order they were written. */
function byDeclaration(a: ExportedDeclaration, b: ExportedDeclaration): number {
  return declarationNumber(a.handle) - declarationNumber(b.handle) || compare(a.exportName, b.exportName);
}

function kindOf(declaration: ExportedDeclaration): Kind {
  const { handle } = declaration;
  if (isModelHandle(handle)) return 'model';
  if (isObjectHandle(handle)) return 'object';
  if (isTupleHandle(handle)) return 'tuple';
  if (isLiteralHandle(handle)) return 'literal';
  if (isEnumHandle(handle)) return 'enum';

  throw refuse(`Export '${declaration.exportName}' in ${declaration.module} is not a schema declaration`);
}

/**
 * Pick the kind a name resolves to, as the parser would for the same bare name. A builder states its
 * kind (`f.object`, `f.tuple`, `f.literal`), but the schema text cannot, so when the name is also
 * declared as a kind the parser tries first, that kind wins. A name that is not declared as the kind
 * the builder states is refused: the text form would have produced a different type than was written.
 */
function resolveKind(
  name: string,
  stated: ReferenceKind,
  order: readonly ReferenceKind[],
  context: Context,
  place: Placed,
): ReferenceKind {
  const declared = order.filter((kind) => context.names[kind].has(name));
  const where = `'${place.exportName}' in ${place.module}`;
  if (!declared.length) {
    throw refuse(
      `${where} refers to '${name}', which no declaration in ${context.entry} provides as an object, tuple, literal or enum`,
    );
  }
  if (!declared.includes(stated)) {
    throw refuse(`${where} refers to '${name}' as ${stated}, but it is declared as ${declared.join(' and ')}`);
  }

  return declared[0]!;
}

function refKeys(kind: ReferenceKind, name: string): Pick<ASTField, 'objectName' | 'tupleName' | 'literalName'> {
  if (kind === 'object') return { objectName: name };
  if (kind === 'tuple') return { tupleName: name };

  return { literalName: name };
}

function statedKind(node: Pick<ASTField, 'type'>): ReferenceKind | undefined {
  return node.type === 'object' || node.type === 'tuple' || node.type === 'literal' ? node.type : undefined;
}

function nameOf(node: Pick<ASTField, 'objectName' | 'tupleName' | 'literalName'>, kind: ReferenceKind): string {
  return (kind === 'object' ? node.objectName : kind === 'tuple' ? node.tupleName : node.literalName) ?? '';
}

function stamp(origin: Origin, decorators: readonly ASTDecorator[]): ASTDecorator[] {
  return decorators.map((decorator) => ({ ...decorator, origin }));
}

function field(node: ASTField, origin: Origin, context: Context, place: Placed): ASTField {
  const decorators = stamp(origin, node.decorators);
  const stated = statedKind(node);
  if (!stated) return { ...node, decorators, origin };
  const kind = resolveKind(nameOf(node, stated), stated, FIELD_ORDER, context, place);
  const { objectName: _o, tupleName: _t, literalName: _l, ...rest } = node;

  return { ...rest, decorators, origin, type: kind, ...refKeys(kind, nameOf(node, stated)) };
}

function element(node: ASTTupleElement, origin: Origin, context: Context, place: Placed): ASTTupleElement {
  const decorators = node.decorators && stamp(origin, node.decorators);
  const stated = statedKind(node);
  const stamped = decorators ? { ...node, decorators, origin } : { ...node, origin };
  if (!stated) return stamped;
  const kind = resolveKind(nameOf(node, stated), stated, FIELD_ORDER, context, place);
  const { objectName: _o, tupleName: _t, literalName: _l, ...rest } = stamped;

  return { ...rest, type: kind, ...refKeys(kind, nameOf(node, stated)) };
}

function variant(node: ASTLiteralVariant, context: Context, place: Placed): ASTLiteralVariant {
  const resolve = (stated: ReferenceKind, name: string): ReferenceKind =>
    resolveKind(name, stated, VARIANT_ORDER, context, place);
  switch (node.kind) {
    case 'objectRef':
    case 'tupleRef':
    case 'literalRef': {
      const stated = node.kind === 'objectRef' ? 'object' : node.kind === 'tupleRef' ? 'tuple' : 'literal';
      const name =
        node.kind === 'objectRef' ? node.objectName : node.kind === 'tupleRef' ? node.tupleName : node.literalName;
      const kind = resolve(stated, name);
      if (kind === 'object') return { kind: 'objectRef', objectName: name };
      if (kind === 'tuple') return { kind: 'tupleRef', tupleName: name };

      return { kind: 'literalRef', literalName: name };
    }
    default:
      return node;
  }
}

function directives(nodes: readonly ASTCompositeDirective[] | undefined, origin: Origin): ASTCompositeDirective[] {
  return (nodes ?? []).map((node) => ({ ...node, origin }));
}

function build(place: Placed, context: Context): ASTModel | ASTObject | ASTTuple | ASTLiteral | ASTEnum {
  const origin: Origin = { kind: 'ts', file: place.module, export: place.exportName };
  const { handle } = place;
  switch (place.kind) {
    case 'model': {
      const node = modelNode(handle);

      return {
        ...node,
        origin,
        fields: node.fields.map((item) => field(item, origin, context, place)),
        directives: directives(node.directives, origin),
      };
    }
    case 'object': {
      const node = objectNode(handle);

      return { ...node, origin, fields: node.fields.map((item) => field(item, origin, context, place)) };
    }
    case 'tuple': {
      const node = tupleNode(handle);

      return { ...node, origin, elements: node.elements.map((item) => element(item, origin, context, place)) };
    }
    case 'literal': {
      const node = literalNode(handle as Parameters<typeof literalNode>[0]);

      return { ...node, origin, variants: node.variants.map((item) => variant(item, context, place)) };
    }
    case 'enum': {
      const node = enumNode(handle as Parameters<typeof enumNode>[0]);

      return { ...node, origin };
    }
  }
}

/**
 * Turn the declarations one schema entry exported into its `SchemaAST`. A declaration exported under
 * several names, or re-exported, is one declaration (identity), and takes the origin of the first place
 * in (module, export) order. Two different declarations with one name both stay, for the duplicate-name
 * check downstream. Each array follows file path, then the order the declarations were written in, as
 * the parser's output does, so the result does not depend on the order modules were imported; fields keep
 * declaration order. A declaration re-exported from another module sorts in the module whose (module,
 * export) place is smallest, which is where its origin points.
 *
 * References resolve by name within the entry, as in the schema text. A name no declaration in the entry
 * provides, including a model name in a field position, is refused. `known` lists names declared
 * elsewhere, which a reference may then resolve to; a literal name there covers an enum too.
 */
export function materialise(declarations: readonly ExportedDeclaration[], known: KnownNames = {}): SchemaAST {
  const unique = new Map<object, ExportedDeclaration>();
  for (const declaration of declarations) {
    const kept = unique.get(declaration.handle);
    if (!kept || byPlace(declaration, kept) < 0) unique.set(declaration.handle, declaration);
  }

  const placed: Placed[] = [...unique.values()].map((declaration) => ({
    ...declaration,
    kind: kindOf(declaration),
    name: (declaration.handle as { name: string }).name,
  }));
  placed.sort((a, b) => compare(a.module, b.module) || byDeclaration(a, b));

  const named = (kinds: readonly Kind[], outside: Iterable<string> = []): Set<string> =>
    new Set([...placed.filter((place) => kinds.includes(place.kind)).map((place) => place.name), ...outside]);
  const modules = [...new Set(placed.map((place) => place.module))].sort(compare);
  const context: Context = {
    names: {
      literal: named(['literal', 'enum'], known.literal),
      object: named(['object'], known.object),
      tuple: named(['tuple'], known.tuple),
    },
    entry: `the schema entry of ${modules.join(', ') || 'no modules'}`,
  };

  const built = placed.map((place) => {
    try {
      return { kind: place.kind, node: build(place, context) };
    } catch (error) {
      if (error instanceof CerialGenerationError) throw error;
      throw refuse(
        `Cannot build '${place.exportName}' in ${place.module}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  });
  const of = <T>(kind: Kind): T[] => built.filter((item) => item.kind === kind).map((item) => item.node as T);

  return createSchemaAST(of('model'), '', of('object'), of('tuple'), of('literal'), of('enum'));
}
