/**
 * AST-keyed cross-check. The registry cannot see these families, so the AST type definitions are
 * the source of truth: each map below is exhaustive over a union, so widening the union is a compile
 * error here until an entry exists in `parity-manifest.ts` and is named in the map.
 */

import type { SchemaAST } from '../types';
import type { OnDeleteAction } from '../types/common.types';
import type { ASTCompositeDirective, ASTLiteralVariantKind } from '../types/parser.types';
import type { ConstructId } from './parity-manifest';

export const LITERAL_VARIANT_CONSTRUCTS: Record<ASTLiteralVariantKind, ConstructId> = {
  string: 'literal.variant.string',
  int: 'literal.variant.int',
  float: 'literal.variant.float',
  bool: 'literal.variant.bool',
  broadType: 'literal.variant.broadType',
  tupleRef: 'literal.variant.tupleRef',
  objectRef: 'literal.variant.objectRef',
  literalRef: 'literal.variant.literalRef',
};

export const COMPOSITE_DIRECTIVE_CONSTRUCTS: Record<ASTCompositeDirective['kind'], ConstructId> = {
  index: 'directive.index',
  unique: 'directive.unique',
};

export const ON_DELETE_CONSTRUCTS: Record<OnDeleteAction, ConstructId> = {
  Cascade: 'decorator.onDelete.Cascade',
  SetNull: 'decorator.onDelete.SetNull',
  SetNone: 'decorator.onDelete.SetNone',
  Restrict: 'decorator.onDelete.Restrict',
  NoAction: 'decorator.onDelete.NoAction',
};

/** A sixth top-level declaration kind added to `SchemaAST` fails here until it is declared. */
export const DECLARATION_CONSTRUCTS: Record<Exclude<keyof SchemaAST, 'source'>, ConstructId> = {
  models: 'decl.model',
  objects: 'decl.object',
  tuples: 'decl.tuple',
  literals: 'decl.literal',
  enums: 'decl.enum',
};
