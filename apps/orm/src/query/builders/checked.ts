/**
 * The `build*Query` functions the package exports. They run the validators the client methods and the
 * `compile*` functions run, then the inner builder, so a caller that skips the client cannot splice
 * select keys, orderBy directions, paging, compute keys or data keys into a statement.
 * The client path validates once itself and calls the unchecked builders directly.
 */
import type { ModelMetadata, ModelRegistry, SelectClause, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { applyFieldDefaults } from '../transformers';
import {
  assertValidReadOptions,
  validateCreateData,
  validateDataUnsetOverlap,
  validateUnset,
  validateUpdateData,
  validateWhere,
  validationFailure,
} from '../validators';
import { buildDeleteQuery, buildDeleteQueryWithReturn } from './delete-builder';
import { buildCreateQuery, stripComputedFields } from './insert-builder';
import type { IncludeClause } from './relation-builder';
import { buildFindManyQuery, buildFindOneQuery, buildSelectQuery, type FindOptionsWithInclude } from './select-builder';
import { buildUpdateManyQuery } from './update-builder';

function assertValidWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry: ModelRegistry | undefined,
  operation: string,
): void {
  const validation = validateWhere(where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, operation);
}

function assertValidFind(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry: ModelRegistry | undefined,
  operation: string,
): void {
  assertValidReadOptions(model, operation, options, registry);
  assertValidWhere(options.where, model, registry, operation);
}

export function buildSelectQueryChecked(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  fromSingle: boolean = false,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidFind(model, options, registry, 'findMany');

  return buildSelectQuery(model, options, fromSingle, registry);
}

export function buildFindOneQueryChecked(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  // findOne forces its own limit, so one passed here is dropped and not validated; offset is refused as in compileFindOne
  const { limit: _limit, ...rest } = options;
  assertValidFind(model, rest, registry, 'findOne');

  return buildFindOneQuery(model, options, registry);
}

export function buildFindManyQueryChecked(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidFind(model, options, registry, 'findMany');

  return buildFindManyQuery(model, options, registry);
}

export function buildCreateQueryChecked(
  model: ModelMetadata,
  data: Record<string, unknown>,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidReadOptions(model, 'create', { select });
  const validation = validateCreateData(applyFieldDefaults(stripComputedFields(data, model), model), model);
  if (!validation.valid) throw validationFailure('data', validation.errors, model, 'create');

  return buildCreateQuery(model, data, select, include, registry);
}

export function buildUpdateManyQueryChecked(
  model: ModelMetadata,
  where: WhereClause,
  data: Record<string, unknown>,
  select?: SelectClause,
  unset?: Record<string, unknown>,
  registry?: ModelRegistry,
  include?: IncludeClause,
): CompiledQuery {
  assertValidReadOptions(model, 'updateMany', { select });
  assertValidWhere(where, model, registry, 'updateMany');

  const dataValidation = validateUpdateData(data, model);
  if (!dataValidation.valid) throw validationFailure('data', dataValidation.errors, model, 'updateMany');

  if (unset) {
    const unsetValidation = validateUnset(unset, model);
    if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, model, 'updateMany');

    const overlap = validateDataUnsetOverlap(data, unset, model);
    if (!overlap.valid) throw validationFailure('unset', overlap.errors, model, 'updateMany');
  }

  return buildUpdateManyQuery(model, where, data, select, unset, registry, include);
}

export function buildDeleteQueryChecked(
  model: ModelMetadata,
  where: WhereClause,
  registry?: ModelRegistry,
  operation = 'deleteMany',
): CompiledQuery {
  assertValidWhere(where, model, registry, operation);

  return buildDeleteQuery(model, where, registry, operation);
}

export function buildDeleteQueryWithReturnChecked(
  model: ModelMetadata,
  where: WhereClause,
  registry?: ModelRegistry,
  operation = 'deleteMany',
): CompiledQuery {
  assertValidWhere(where, model, registry, operation);

  return buildDeleteQueryWithReturn(model, where, registry, operation);
}
