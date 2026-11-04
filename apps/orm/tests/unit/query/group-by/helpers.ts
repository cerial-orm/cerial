import { buildGroupByQuery } from '../../../../src/query/builders';
import { validateGroupBy } from '../../../../src/query/validators';
import type { GroupByArgs } from '../../../../src/query/validators';
import type { CompiledQuery } from '../../../../src/query/compile/types';
import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../../../src/types';
import { field } from '../helpers';

const address: FieldMetadata[] = [
  field({ name: 'city', type: 'string', isRequired: false }),
  field({
    name: 'geo',
    type: 'object',
    isRequired: false,
    objectInfo: { objectName: 'Geo', fields: [field({ name: 'lat', type: 'float' })] },
  }),
];

export const order: ModelMetadata = {
  name: 'Order',
  tableName: 'order',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'status', type: 'string' }),
    field({ name: 'total', type: 'decimal' }),
    field({ name: 'qty', type: 'int' }),
    field({ name: 'weight', type: 'float', isRequired: false }),
    field({ name: 'paid', type: 'bool' }),
    field({ name: 'createdAt', type: 'date' }),
    field({ name: 'wait', type: 'duration', isRequired: false }),
    field({ name: 'ref', type: 'uuid', isRequired: false }),
    field({ name: 'note', type: 'string', isRequired: false, isNullable: true }),
    field({ name: 'customerId', type: 'record' }),
    field({ name: 'tags', type: 'string', isArray: true }),
    field({ name: 'scores', type: 'int', isArray: true }),
    field({
      name: 'kind',
      type: 'literal',
      literalInfo: { literalName: 'Kind', isEnum: true, variants: [{ kind: 'string', value: 'a' }] },
    }),
    field({
      name: 'mixed',
      type: 'literal',
      literalInfo: {
        literalName: 'Mixed',
        variants: [{ kind: 'objectRef', objectName: 'Geo', objectInfo: { objectName: 'Geo', fields: [] } }],
      },
    }),
    field({
      name: 'address',
      type: 'object',
      isRequired: false,
      objectInfo: { objectName: 'Address', fields: address },
    }),
    field({
      name: 'meta',
      type: 'object',
      isRequired: false,
      isFlexible: true,
      objectInfo: { objectName: 'Meta', fields: [field({ name: 'known', type: 'string', isRequired: false })] },
    }),
    field({
      name: 'lines',
      type: 'object',
      isArray: true,
      objectInfo: { objectName: 'Line', fields: [field({ name: 'sku', type: 'string' })] },
    }),
    field({ name: 'pos', type: 'tuple', tupleInfo: { tupleName: 'Pos', elements: [] } }),
    field({ name: 'blob', type: 'bytes', isRequired: false }),
    field({ name: 'shape', type: 'geometry', isRequired: false }),
    field({ name: 'extra', type: 'any', isRequired: false }),
    field({
      name: 'customer',
      type: 'relation',
      isRequired: false,
      relationInfo: { targetModel: 'Customer', targetTable: 'customer', fieldRef: 'customerId', isReverse: false },
    }),
  ],
};

const customer: ModelMetadata = {
  name: 'Customer',
  tableName: 'customer',
  fields: [field({ name: 'id', type: 'record', isId: true }), field({ name: 'name', type: 'string' })],
};

export const registry: ModelRegistry = { Order: order, Customer: customer };

/** The validator takes caller input, so the helpers accept loose objects the way a JS caller could send them. */
export type Loose = Record<string, unknown>;

export const problems = (args: unknown, model = order): string[] =>
  validateGroupBy(args, model, registry).map((p) => p.message);

/** Compiles args that must be valid, so a test of query shape fails loudly if the validator refuses them. */
export function compile(args: Loose): CompiledQuery {
  const found = problems(args);
  if (found.length) throw new Error(`args are not valid: ${found.join('; ')}`);

  return buildGroupByQuery(order, args as unknown as GroupByArgs, registry);
}
