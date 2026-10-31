import { e, f, model, object, tuple } from '../../../../src/schema';
import { Role } from './enums.schema';
import { Status } from './literals.schema';

export const Coordinate = tuple('Coordinate', { lat: e.float(), lng: e.float() });

// Mixed named and unnamed elements
export const Entry = tuple('Entry', [e.string().named('name'), e.int(), e.bool()]);

export const Inner = tuple('Inner', { x: e.int(), y: e.int() });

export const Outer = tuple('Outer', [e.string().named('label'), e.tuple(Inner)]);

export const TupleAddress = object('TupleAddress', {
  street: f.string(),
  city: f.string(),
});

export const Located = tuple('Located', [e.string().named('tag'), e.object(TupleAddress)]);

export const WithOptional = tuple('WithOptional', [e.string().named('text'), e.float().nullable()]);

export const TupleBasic = model('TupleBasic', {
  id: f.record().id(),
  name: f.string(),
  location: f.tuple(Coordinate),
  backup: f.tuple(Coordinate).optional(),
  history: f.tuple(Coordinate).array(),
  entry: f.tuple(Entry).optional(),
});

export const TupleNested = model('TupleNested', {
  id: f.record().id(),
  payload: f.tuple(Outer),
});

export const TupleObjInTuple = model('TupleObjInTuple', {
  id: f.record().id(),
  place: f.tuple(Located),
});

export const TupleInObj = model('TupleInObj', {
  id: f.record().id(),
  details: f.object('TupleHolder'),
});

export const TupleHolder = object('TupleHolder', {
  label: f.string(),
  coord: f.tuple(Coordinate),
  optCoord: f.tuple(Coordinate).optional(),
});

export const TupleWithRelation = model('TupleWithRelation', {
  id: f.record().id(),
  name: f.string(),
  location: f.tuple(Coordinate),
  posts: f.reverse('TupleRelatedPost').array(),
});

export const TupleRelatedPost = model('TupleRelatedPost', {
  id: f.record().id(),
  title: f.string(),
  position: f.tuple(Coordinate).optional(),
  authorId: f.record(),
  author: f.relation(TupleWithRelation).field('authorId'),
});

export const DeepInnerObj = object('DeepInnerObj', {
  payload: f.string(),
  extra: f.string(),
});

export const DeepInnerTuple = tuple('DeepInnerTuple', [e.float(), e.object(DeepInnerObj)]);

export const DeepMidObj = object('DeepMidObj', {
  name: f.string(),
  age: f.int().optional(),
  pos: f.tuple(DeepInnerTuple),
});

export const DeepMidTuple = tuple('DeepMidTuple', [e.string(), e.object(DeepMidObj)]);

export const DeepOuterTuple = tuple('DeepOuterTuple', [e.string(), e.tuple(DeepMidTuple)]);

export const TupleDeepNest = model('TupleDeepNest', {
  id: f.record().id(),
  deep: f.tuple(DeepOuterTuple),
  deepOpt: f.tuple(DeepOuterTuple).optional(),
});

export const NullablePair = tuple('NullablePair', { label: e.string(), count: e.int().nullable() });

export const OptNullPair = tuple('OptNullPair', { tag: e.string(), score: e.float().nullable() });

export const MixedNullability = tuple('MixedNullability', {
  required: e.string(),
  optOnly: e.int().nullable(),
  nullOnly: e.float().nullable(),
  both: e.bool().nullable(),
});

export const TupleNullable = model('TupleNullable', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(NullablePair),
  optNull: f.tuple(OptNullPair),
  mixed: f.tuple(MixedNullability),
});

export const Stamped = tuple('Stamped', {
  label: e.string(),
  born: e.date().createdAt(),
  touched: e.date().updatedAt(),
  hits: e.int().defaultAlways(7),
});

export const TupleStamped = model('TupleStamped', {
  id: f.record().id(),
  name: f.string(),
  stamp: f.tuple(Stamped),
});

export const Defaulted = tuple('Defaulted', { label: e.string(), tier: e.int().default(1) });

export const TupleDefaulted = model('TupleDefaulted', {
  id: f.record().id(),
  name: f.string(),
  meta: f.tuple(Defaulted),
});

export const StampedInner = tuple('StampedInner', { count: e.int(), at: e.date().createdAt() });

// Mixed named and unnamed elements, as for Entry
export const StampedOuter = tuple('StampedOuter', [e.string().named('label'), e.tuple(StampedInner)]);

export const TupleDecoratedNest = model('TupleDecoratedNest', {
  id: f.record().id(),
  name: f.string(),
  outer: f.tuple(StampedOuter),
  maybe: f.tuple(Stamped).optional(),
});

export const StatusPair = tuple('StatusPair', { state: e.literal(Status), count: e.int() });

export const RolePair = tuple('RolePair', [e.literal(Role), e.int()]);

export const TupleLiteralElement = model('TupleLiteralElement', {
  id: f.record().id(),
  name: f.string(),
  status: f.tuple(StatusPair),
  role: f.tuple(RolePair),
  history: f.tuple(StatusPair).array(),
});
