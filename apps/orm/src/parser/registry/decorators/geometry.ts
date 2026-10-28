import { parseGeometryDecorator } from '../../types/field-decorators';
import type { DecoratorEntry } from '../types';

/** The geometry subtype each decorator constrains a Geometry field to. */
const GEOMETRY_SUBTYPES = [
  ['@point', 'point'],
  ['@line', 'line'],
  ['@polygon', 'polygon'],
  ['@multipoint', 'multipoint'],
  ['@multiline', 'multiline'],
  ['@multipolygon', 'multipolygon'],
  ['@geoCollection', 'collection'],
] as const;

// Several can sit on one field, which then accepts any of those subtypes, so none excludes another.
export const geometryDecorators: readonly DecoratorEntry[] = GEOMETRY_SUBTYPES.map(
  ([name, subtype]): DecoratorEntry => ({
    name,
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: [],
    description: `Constrains a Geometry field to the ${subtype} subtype. Combine several to accept any of them.`,
    parse: parseGeometryDecorator,
  }),
);
