import { e, f, literal, model, object, tuple, variant } from '../../../../src/schema';

export const Status = literal('Status', [
  variant.string('active'),
  variant.string('inactive'),
  variant.string('pending'),
]);

export const Priority = literal('Priority', [variant.int(1), variant.int(2), variant.int(3)]);

export const Mixed = literal('Mixed', [
  variant.string('low'),
  variant.string('high'),
  variant.int(1),
  variant.int(2),
  variant.bool(true),
]);

export const ExtendedStatus = literal('ExtendedStatus', [
  variant.literal(Status),
  variant.string('archived'),
  variant.string('deleted'),
]);

export const Broad = literal('Broad', [variant.broadType('String'), variant.broadType('Int')]);

export const NumericOnly = literal('NumericOnly', [
  variant.int(1),
  variant.int(2),
  variant.int(3),
  variant.int(4),
  variant.int(5),
]);

export const LiteralBasic = model('LiteralBasic', {
  id: f.record().id(),
  name: f.string(),
  status: f.literal(Status),
  priority: f.literal(Priority),
  optStatus: f.literal(Status).optional(),
  nullStatus: f.literal(Status).optional().nullable(),
  statuses: f.literal(Status).array(),
  mixed: f.literal(Mixed),
});

export const LiteralUnique = model('LiteralUnique', {
  id: f.record().id(),
  status: f.literal(Status).unique(),
});

export const LiteralDefaults = model('LiteralDefaults', {
  id: f.record().id(),
  label: f.string(),
  status: f.literal(Status).default('active'),
  priority: f.literal(Priority).default(1),
});

export const LiteralBroad = model('LiteralBroad', {
  id: f.record().id(),
  payload: f.literal(Broad),
  values: f.literal(Broad).array(),
});

export const LiteralExtended = model('LiteralExtended', {
  id: f.record().id(),
  status: f.literal(ExtendedStatus),
});

export const LiteralNumeric = model('LiteralNumeric', {
  id: f.record().id(),
  rank: f.literal(NumericOnly),
  optRank: f.literal(NumericOnly).optional(),
});

export const LiteralAddress = object('LiteralAddress', {
  city: f.string(),
  status: f.literal(Status),
});

export const LiteralWithObject = model('LiteralWithObject', {
  id: f.record().id(),
  name: f.string(),
  address: f.object(LiteralAddress),
  optAddress: f.object(LiteralAddress).optional(),
});

export const LiteralCoord = tuple('LiteralCoord', { x: e.float(), y: e.float() });

export const LiteralPoint = object('LiteralPoint', {
  label: f.string(),
  payload: f.int(),
});

export const WithTuple = literal('WithTuple', [variant.string('none'), variant.tuple(LiteralCoord)]);

export const WithObject = literal('WithObject', [variant.string('empty'), variant.object(LiteralPoint)]);

export const WithBoth = literal('WithBoth', [
  variant.string('none'),
  variant.string('empty'),
  variant.tuple(LiteralCoord),
  variant.object(LiteralPoint),
]);

export const LiteralWithTuple = model('LiteralWithTuple', {
  id: f.record().id(),
  payload: f.literal(WithTuple),
  optPayload: f.literal(WithTuple).optional(),
  payloads: f.literal(WithTuple).array(),
});

export const LiteralWithObjectVariant = model('LiteralWithObjectVariant', {
  id: f.record().id(),
  payload: f.literal(WithObject),
  optPayload: f.literal(WithObject).optional(),
  payloads: f.literal(WithObject).array(),
});

export const LiteralWithBoth = model('LiteralWithBoth', {
  id: f.record().id(),
  data: f.literal(WithBoth),
  optData: f.literal(WithBoth).optional(),
});

export const LiteralPointOpt = object('LiteralPointOpt', {
  label: f.string(),
  count: f.int().optional(),
  tag: f.string().optional().nullable(),
});

export const WithObjectOpt = literal('WithObjectOpt', [variant.string('empty'), variant.object(LiteralPointOpt)]);

export const LiteralWithObjectOpt = model('LiteralWithObjectOpt', {
  id: f.record().id(),
  payload: f.literal(WithObjectOpt),
  optPayload: f.literal(WithObjectOpt).optional(),
});

export const Ratio = literal('Ratio', [variant.float(0.5), variant.float(1.5), variant.float(2.5)]);

export const FloatOrText = literal('FloatOrText', [variant.broadType('Float'), variant.broadType('String')]);

export const DateOrFlag = literal('DateOrFlag', [variant.broadType('Date'), variant.broadType('Bool')]);

export const LiteralNumberKinds = model('LiteralNumberKinds', {
  id: f.record().id(),
  ratio: f.literal(Ratio),
  amount: f.literal(FloatOrText),
  moment: f.literal(DateOrFlag),
});

export const LiteralTagged = object('LiteralTagged', {
  states: f.literal(Status).array(),
  label: f.string(),
});

export const LiteralObjectArray = model('LiteralObjectArray', {
  id: f.record().id(),
  tagged: f.object(LiteralTagged),
});
