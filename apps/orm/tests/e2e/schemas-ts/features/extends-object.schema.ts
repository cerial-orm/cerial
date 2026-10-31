import { f, model, object } from '../../../../src/schema';

export const ExtBaseAddress = object('ExtBaseAddress', {
  street: f.string(),
  city: f.string(),
  zip: f.string(),
  country: f.string().default('US'),
});

export const ExtAddress = object(
  'ExtAddress',
  {
    apartment: f.string().optional(),
    coordinates: f.float().array(),
  },
  { extends: ExtBaseAddress },
);

export const ExtCityAddress = object(
  'ExtCityAddress',
  { district: f.string().optional() },
  { extends: ExtBaseAddress.pick('city', 'country') },
);

export const ExtSimpleAddress = object(
  'ExtSimpleAddress',
  { region: f.string().optional() },
  { extends: ExtBaseAddress.omit('country') },
);

export const ExtDetailedAddress = object(
  'ExtDetailedAddress',
  {
    country: f.string().default('USA'),
    latitude: f.float().optional(),
    longitude: f.float().optional(),
    timezone: f.string().optional(),
  },
  { extends: ExtBaseAddress },
);

export const ExtPrivateAddress = object(
  'ExtPrivateAddress',
  {
    street: f.string().private(),
    zip: f.string().private(),
    publicCity: f.string().optional(),
  },
  { extends: ExtBaseAddress },
);

export const ExtGeoAddress = object(
  'ExtGeoAddress',
  {
    elevation: f.float().optional(),
    timezone: f.string().default('UTC'),
  },
  { extends: ExtAddress },
);

export const ExtMetaAddress = object(
  'ExtMetaAddress',
  {
    verified: f.bool().default(false),
    verifiedAt: f.date().optional(),
    tags: f.string().array(),
    rating: f.int().optional(),
  },
  { extends: ExtBaseAddress },
);

export const ExtAddressUser = model('ExtAddressUser', {
  id: f.record().id(),
  name: f.string(),
  homeAddress: f.object(ExtAddress),
  workAddress: f.object(ExtDetailedAddress).optional(),
  previousAddresses: f.object(ExtGeoAddress).array(),
});

export const ExtChainBase = object('ExtChainBase', {
  a: f.string(),
  b: f.string(),
  c: f.string(),
});

export const ExtChainPicked = object(
  'ExtChainPicked',
  {
    p: f.string(),
    q: f.string(),
  },
  { extends: ExtChainBase.pick('a', 'b') },
);

export const ExtChainPickedThenOmitted = object(
  'ExtChainPickedThenOmitted',
  { r: f.string().optional() },
  { extends: ExtChainPicked.omit('p') },
);

export const ExtChainOmitted = object(
  'ExtChainOmitted',
  {
    p: f.string(),
    q: f.string(),
  },
  { extends: ExtChainBase.omit('c') },
);

export const ExtChainOmittedThenPicked = object(
  'ExtChainOmittedThenPicked',
  { r: f.string().optional() },
  { extends: ExtChainOmitted.pick('q') },
);

export const ExtChainModel = model('ExtChainModel', {
  id: f.record().id(),
  pickThenOmit: f.object(ExtChainPickedThenOmitted),
  omitThenPick: f.object(ExtChainOmittedThenPicked),
});
