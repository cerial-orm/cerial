import { e, f, model, object, tuple } from '../../../../src/schema';

export const GeometryBasic = model('GeometryBasic', {
  id: f.record().id(),
  name: f.string(),
  location: f.geometry().point(),
  area: f.geometry().polygon(),
  shape: f.geometry(),
  route: f.geometry().line(),
  multi: f.geometry().point().polygon(),
  optionalGeo: f.geometry().optional().point(),
  geoArray: f.geometry().array().point(),
});

export const GeoInfo = object('GeoInfo', {
  position: f.geometry().point(),
  boundary: f.geometry().optional(),
});

export const GeoPair = tuple('GeoPair', [e.geometry(), e.geometry().nullable()]);

export const GeometryWithObject = model('GeometryWithObject', {
  id: f.record().id(),
  name: f.string(),
  geo: f.object(GeoInfo),
});

export const GeometryWithTuple = model('GeometryWithTuple', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(GeoPair),
});

export const GeometryMulti = model('GeometryMulti', {
  id: f.record().id(),
  name: f.string(),
  points: f.geometry().multipoint(),
  lines: f.geometry().multiline(),
  polygons: f.geometry().multipolygon(),
  collection: f.geometry().geoCollection(),
});
