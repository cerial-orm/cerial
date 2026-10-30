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

/** Narrower than `DecoratorEntry` so the builder's types still see seven zero-argument model and object field methods. */
interface GeometryEntry extends DecoratorEntry {
  readonly name: (typeof GEOMETRY_SUBTYPES)[number][0];
  readonly args: { readonly kind: 'none' };
  readonly targets: readonly ['modelField', 'objectField'];
  /** Empty, so chaining one geometry decorator removes nothing from the builder. */
  readonly excludes: readonly [];
}

// Several can sit on one field, which then accepts any of those subtypes, so none excludes another.
export const geometryDecorators: readonly GeometryEntry[] = GEOMETRY_SUBTYPES.map(
  ([name, constructId, subtype]): GeometryEntry => ({
    name,
    constructId,
    args: { kind: 'none' },
    targets: ['modelField', 'objectField'],
    excludes: [],
    description: `Constrains a Geometry field to the ${subtype} subtype. Combine several to accept any of them.`,
    parse: parseGeometryDecorator,
  }),
);
