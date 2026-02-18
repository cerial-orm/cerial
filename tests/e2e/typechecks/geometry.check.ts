import type {
  CerialGeometry,
  CerialGeometryInput,
  CerialLineString,
  CerialLineStringInput,
  CerialPoint,
  CerialPointInput,
  CerialPolygon,
  CerialPolygonInput,
} from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  GeoInfo,
  GeoInfoInput as GeoInfoCreateInput,
  GeometryBasic,
  GeometryBasicCreate,
  GeometryBasicInput,
  GeometryBasicOrderBy,
  GeometryBasicSelect,
  GeometryBasicUpdate,
  GeometryBasicWhere,
  GeometryWithObject,
  GeometryWithTuple,
  GeoPair,
  GeoPairInput,
} from '../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// GeometryBasic Output Type — subtype decorators narrow the output
// =============================================================================

Test.checks([
  Test.check<GeometryBasic['location'], CerialPoint, Test.Pass>(),
  Test.check<GeometryBasic['area'], CerialPolygon, Test.Pass>(),
  Test.check<GeometryBasic['route'], CerialLineString, Test.Pass>(),
  Test.check<GeometryBasic['shape'], CerialGeometry, Test.Pass>(),
  Test.check<GeometryBasic['multi'], CerialPoint | CerialPolygon, Test.Pass>(),
  Test.check<GeometryBasic['geoArray'], CerialPoint[], Test.Pass>(),
]);

// Optional geometry → CerialPoint | undefined
const _optGeo: GeometryBasic['optionalGeo'] = undefined;

// =============================================================================
// GeometryBasic Input Type — subtype decorators narrow the input
// =============================================================================

Test.checks([
  Test.check<GeometryBasicInput['location'], CerialPointInput, Test.Pass>(),
  Test.check<GeometryBasicInput['area'], CerialPolygonInput, Test.Pass>(),
  Test.check<GeometryBasicInput['route'], CerialLineStringInput, Test.Pass>(),
  Test.check<GeometryBasicInput['shape'], CerialGeometryInput, Test.Pass>(),
  Test.check<GeometryBasicInput['multi'], CerialPointInput | CerialPolygonInput, Test.Pass>(),
  Test.check<GeometryBasicInput['geoArray'], CerialPointInput[], Test.Pass>(),
]);

// =============================================================================
// GeometryBasicCreate — geoArray optional (defaults to []), optionalGeo optional
// =============================================================================

Test.checks([
  Test.check<HasKey<GeometryBasicCreate, 'location'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'area'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'shape'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'route'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'multi'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'optionalGeo'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicCreate, 'geoArray'>, 1, Test.Pass>(),
]);

const _minCreate: GeometryBasicCreate = {
  name: 'test',
  location: [1, 2],
  area: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  shape: [0, 0],
  route: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
  multi: [0, 0],
};

// =============================================================================
// GeometryBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<GeometryBasicUpdate, 'location'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicUpdate, 'geoArray'>, 1, Test.Pass>(),
]);

// =============================================================================
// GeometryBasicWhere — geometry fields have equality operators (no gt/lt/gte/lte)
// =============================================================================

Test.checks([
  Test.check<HasKey<GeometryBasicWhere, 'location'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'area'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'shape'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'optionalGeo'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'geoArray'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// GeometryBasicOrderBy — geometry fields EXCLUDED from orderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ name: 'asc' | 'desc' }, GeometryBasicOrderBy>, 1, Test.Pass>(),
  Test.check<HasKey<GeometryBasicOrderBy, 'location'>, 0, Test.Pass>(),
  Test.check<HasKey<GeometryBasicOrderBy, 'area'>, 0, Test.Pass>(),
  Test.check<HasKey<GeometryBasicOrderBy, 'shape'>, 0, Test.Pass>(),
]);

// =============================================================================
// GeometryBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ location: true }, GeometryBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// GeoInfo Object — position required (@point), boundary optional (bare Geometry)
// =============================================================================

Test.checks([
  Test.check<GeoInfo['position'], CerialPoint, Test.Pass>(),
  Test.check<HasKey<GeoInfoCreateInput, 'position'>, 1, Test.Pass>(),
  Test.check<HasKey<GeoInfoCreateInput, 'boundary'>, 1, Test.Pass>(),
]);

const _minObjCreate: GeoInfoCreateInput = { position: [1, 2] };

// =============================================================================
// GeoPair Tuple — output is [CerialGeometry, CerialGeometry | null]
// =============================================================================

Test.checks([Test.check<GeoPair, [CerialGeometry, CerialGeometry | null], Test.Pass>()]);

const _tupleArr: GeoPairInput = [
  [1, 2],
  [3, 4],
];
const _tupleObj: GeoPairInput = { 0: [1, 2] };

// =============================================================================
// GeometryWithObject — geo field uses GeoInfo
// =============================================================================

Test.checks([Test.check<GeometryWithObject['geo'], GeoInfo, Test.Pass>()]);

// =============================================================================
// GeometryWithTuple — pair field uses GeoPair
// =============================================================================

Test.checks([Test.check<GeometryWithTuple['pair'], GeoPair, Test.Pass>()]);
