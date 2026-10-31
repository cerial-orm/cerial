/** Every TypeScript example on docs/schema/typescript/fields.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { f, model } from '../../../../src/schema';

export const Scalars = model('Scalars', {
  id: f.record().id(),
  name: f.string(),
  contact: f.email(),
  count: f.int(),
  ratio: f.float(),
  amount: f.number(),
  active: f.bool(),
  born: f.date(),
  token: f.uuid(),
  ttl: f.duration(),
  price: f.decimal(),
  blob: f.bytes(),
  area: f.geometry(),
  payload: f.any(),
});

export const Modifiers = model('Modifiers', {
  id: f.record().id(),
  nickname: f.string().optional(),
  middleName: f.string().optional().nullable(),
  tags: f.string().array(),
  secret: f.string().private(),
});

export const Lists = model('Lists', {
  id: f.record().id(),
  names: f.string().array(),
  contacts: f.email().array(),
  counts: f.int().array(),
  ratios: f.float().array(),
  amounts: f.number().array(),
  flags: f.bool().array(),
  dates: f.date().array(),
  tokens: f.uuid().array(),
  spans: f.duration().array(),
  prices: f.decimal().array(),
  blobs: f.bytes().array(),
  shapes: f.geometry().array(),
  anything: f.any().array(),
});

export const Loose = model('Loose', {
  id: f.record().id(),
  // @ts-expect-error Any already accepts NONE and null
  maybe: f.any().optional(),
});

export const Decorated = model('Decorated', {
  id: f.record().id(),
  email: f.email().unique(),
  handle: f.string().index(),
  role: f.string().default('user'),
  visits: f.int().defaultAlways(0),
  createdAt: f.date().createdAt(),
  updatedAt: f.date().updatedAt(),
  seenAt: f.date().now(),
  ttl: f.duration().default('1h'),
  code: f.string().readonly(),
});

export const Tokens = model('Tokens', {
  id: f.record().id(),
  anyId: f.uuid().uuid(),
  randomId: f.uuid().uuid4(),
  sortableId: f.uuid().uuid7(),
});

export const Clash = model('Clash', {
  id: f.record().id(),
  // @ts-expect-error uuid cannot be combined with default
  token: f.uuid().uuid().default('fixed'),
});

export const Collections = model('Collections', {
  id: f.record().id(),
  scores: f.int().array().sort(),
  recent: f.date().array().sort('false'),
  labels: f.string().array().distinct(),
  members: f.string().array().set(),
});

export const Places = model('Places', {
  id: f.record().id(),
  spot: f.geometry().point(),
  route: f.geometry().line(),
  zone: f.geometry().polygon(),
  spots: f.geometry().multipoint(),
  routes: f.geometry().multiline(),
  zones: f.geometry().multipolygon(),
  mixed: f.geometry().geoCollection(),
  either: f.geometry().point().polygon(),
});
