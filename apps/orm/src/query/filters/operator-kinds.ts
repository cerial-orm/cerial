/**
 * Which operators a field takes. This restates, per field kind, the operator table the generated Where type
 * is built from (`generateFieldWhereType`), so an operator the type omits is refused at runtime too, naming
 * the field, instead of reaching the database. Literal and enum fields are left to their variants.
 */

import type { FieldMetadata } from '../../types';
import { SIZED_NUMBER_SURREAL_TYPES } from '../../utils/type-utils';

export type KindField = Pick<FieldMetadata, 'type' | 'isArray'>;
export type KindPredicate = (field: KindField) => boolean;

const NUMERIC = new Set<string>([
  'int',
  'float',
  'number',
  'date',
  'duration',
  'decimal',
  ...Object.keys(SIZED_NUMBER_SURREAL_TYPES),
]);

/** Kinds that carry no per-kind table of their own */
const unrestricted = (field: KindField): boolean => field.type === 'literal' || field.type === 'any' || !!field.isArray;

export const anyKind: KindPredicate = () => true;

/**
 * Ordering has no meaning on a whole array, and the database sorts a set above every array, so gt, lt and
 * between on an array or @set field would match rows by type rather than by content.
 */
const unrestrictedScalar = (field: KindField): boolean => field.type === 'literal' || field.type === 'any';

/** gt, gte, lt, lte: numbers, dates, durations, decimals, uuids; never an array or @set */
export const orderable: KindPredicate = (field) =>
  !field.isArray && (unrestrictedScalar(field) || NUMERIC.has(field.type) || field.type === 'uuid');

/** between has no uuid form; never an array or @set */
export const rangeable: KindPredicate = (field) =>
  !field.isArray && (unrestrictedScalar(field) || NUMERIC.has(field.type));

/** contains, startsWith, endsWith */
export const textual: KindPredicate = (field) =>
  unrestricted(field) || field.type === 'string' || field.type === 'email' || field.type === 'record';

/** in, notIn: every kind but bool */
export const listable: KindPredicate = (field) => unrestricted(field) || field.type !== 'bool';

/** has, hasAll, hasAny, isEmpty */
export const arrayOnly: KindPredicate = (field) => !!field.isArray;
