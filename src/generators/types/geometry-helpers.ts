import type { FieldMetadata } from '../../types';

const SUBTYPE_OUTPUT_MAP: Record<string, string> = {
  point: 'CerialPoint',
  line: 'CerialLineString',
  polygon: 'CerialPolygon',
  multipoint: 'CerialMultiPoint',
  multiline: 'CerialMultiLineString',
  multipolygon: 'CerialMultiPolygon',
  collection: 'CerialGeometryCollection',
};

const SUBTYPE_INPUT_MAP: Record<string, string> = {
  point: 'CerialPointInput',
  line: 'CerialLineStringInput',
  polygon: 'CerialPolygonInput',
  multipoint: 'CerialMultiPointInput',
  multiline: 'CerialMultiLineStringInput',
  multipolygon: 'CerialMultiPolygonInput',
  collection: 'CerialGeometryCollectionInput',
};

export function getGeometryOutputType(field: FieldMetadata): string {
  const subtypes = field.geometrySubtypes;
  if (!subtypes || !subtypes.length) return 'CerialGeometry';
  if (subtypes.length === 1) return SUBTYPE_OUTPUT_MAP[subtypes[0]!]!;

  return subtypes.map((s) => SUBTYPE_OUTPUT_MAP[s]!).join(' | ');
}

export function getGeometryInputType(field: FieldMetadata): string {
  const subtypes = field.geometrySubtypes;
  if (!subtypes || !subtypes.length) return 'CerialGeometryInput';
  if (subtypes.length === 1) return SUBTYPE_INPUT_MAP[subtypes[0]!]!;

  return subtypes.map((s) => SUBTYPE_INPUT_MAP[s]!).join(' | ');
}
