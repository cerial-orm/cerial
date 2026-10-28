import { parseGeometryDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

/** The geometry subtype each decorator constrains a Geometry field to. */
const GEOMETRY_SUBTYPES = [
  ['@point', 'decorator.point', 'point'],
  ['@line', 'decorator.line', 'line'],
  ['@polygon', 'decorator.polygon', 'polygon'],
  ['@multipoint', 'decorator.multipoint', 'multipoint'],
  ['@multiline', 'decorator.multiline', 'multiline'],
  ['@multipolygon', 'decorator.multipolygon', 'multipolygon'],
  ['@geoCollection', 'decorator.geoCollection', 'collection'],
] as const;

// Several can sit on one field, which then accepts any of those subtypes, so none excludes another.
export const geometryDecorators: readonly DecoratorEntry[] = GEOMETRY_SUBTYPES.map(
  ([name, constructId, subtype]): DecoratorEntry => ({
    name,
    constructId,
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: [],
    description: `Constrains a Geometry field to the ${subtype} subtype. Combine several to accept any of them.`,
    parse: parseGeometryDecorator,
  }),
);
