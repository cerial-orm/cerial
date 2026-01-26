/**
 * Query-specific type definitions for filter operations and query building
 */

import type { SchemaFieldType } from './common.types';
import type { FieldMetadata } from './metadata.types';

/** Comparison filter operators */
export interface ComparisonOperators<T> {
  eq?: T;
  neq?: T;
  gt?: T;
  gte?: T;
  lt?: T;
  lte?: T;
}

/** String filter operators */
export interface StringOperators {
  contains?: string;
  startsWith?: string;
  endsWith?: string;
}

/** Array filter operators */
export interface ArrayOperators<T> {
  in?: T[];
  notIn?: T[];
}

/** Special filter operators */
export interface SpecialOperators<T> {
  isNull?: boolean;
  isDefined?: boolean;
  between?: [T, T];
}

/** Combined filter for a single field */
export type FieldFilter<T> = T | (ComparisonOperators<T> & StringOperators & ArrayOperators<T> & SpecialOperators<T>);

/** Generic where clause */
export interface WhereClause {
  [fieldName: string]: FieldFilter<unknown> | WhereClause[] | undefined;
  AND?: WhereClause[];
  OR?: WhereClause[];
  NOT?: WhereClause;
}

/** Select clause for field selection */
export interface SelectClause {
  [fieldName: string]: boolean;
}

/** Order by direction */
export type OrderDirection = 'asc' | 'desc';

/** Order by clause */
export interface OrderByClause {
  [fieldName: string]: OrderDirection;
}

/** Find options for queries */
export interface FindOptions {
  where?: WhereClause;
  select?: SelectClause;
  orderBy?: OrderByClause;
  limit?: number;
  offset?: number;
}

/** Find one options */
export interface FindOneOptions extends Omit<FindOptions, 'limit' | 'offset'> {}

/** Find many options */
export interface FindManyOptions extends FindOptions {}

/** Find unique options (requires id in where clause) */
export interface FindUniqueOptions extends Omit<FindOneOptions, 'orderBy'> {
  /** Where clause must contain id field, stripping any id operators */
  where: Omit<WhereClause, 'id'> & { id: string };
}

/** Create options */
export interface CreateOptions<T> {
  data: T;
  select?: SelectClause;
}

/** Update options */
export interface UpdateOptions<T> {
  where: WhereClause;
  data: Partial<T>;
  select?: SelectClause;
}

/** DeleteMany options */
export interface DeleteManyOptions {
  where: WhereClause;
}

/** Compiled query with parameterized values */
export interface CompiledQuery {
  /** The query text with placeholders */
  text: string;
  /** The variable bindings */
  vars: QueryVars;
}

/** Query variables for parameterized queries */
export interface QueryVars {
  [key: string]: unknown;
}

/** Query fragment (partial query with vars) */
export interface QueryFragment {
  text: string;
  vars: QueryVars;
}

/** Variable binding result */
export interface VarBinding {
  placeholder: string;
  vars: QueryVars;
}

/** Context for filter compilation */
export interface FilterCompileContext {
  /** Bind a value and return placeholder */
  bind(field: string, operator: string, value: unknown, fieldType: SchemaFieldType): VarBinding;
  /** Get current variable counter */
  getCounter(): number;
}

/** Query executor result */
export interface QueryResult<T> {
  data: T[];
  count?: number;
}

/** Single record result */
export interface SingleResult<T> {
  data: T | null;
}

/** Operator handler function signature */
export type OperatorHandler = (
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
) => QueryFragment;

/** Operator registry type */
export interface OperatorRegistry {
  [operator: string]: OperatorHandler;
}
