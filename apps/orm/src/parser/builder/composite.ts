import type { ASTCompositeDirective } from '../../types';
import { buildOptions } from './options';
import type { Options } from './types';

/**
 * One entry of a composite directive's field list: a top-level key of the model, or a dotted path into
 * one of its object fields. Only the head is checked here; whether the tail resolves is the validator's
 * job, as it is for a schema written in text.
 */
export type CompositeFieldPath<Key extends string> = Key | `${Key}.${string}`;

/**
 * Build the `@@index` and `@@unique` nodes of a model from its options. A key holding a list yields one
 * node per entry, in list order, because a model may declare the same directive kind more than once.
 */
export function compositeDirectives(options: Options<'model'>): ASTCompositeDirective[] {
  return buildOptions('model', options) as ASTCompositeDirective[];
}
