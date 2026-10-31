import { f, model, object } from '../../../../src/schema';

export const FlexAddress = object('FlexAddress', {
  street: f.string(),
  city: f.string(),
  zip: f.string().optional().nullable(),
});

export const FlexMeta = object('FlexMeta', {
  label: f.string(),
});

export const FlexProfile = object('FlexProfile', {
  bio: f.string(),
  metadata: f.object(FlexMeta).flexible(),
});

export const FlexUser = model('FlexUser', {
  id: f.record().id(),
  name: f.string(),
  address: f.object(FlexAddress).flexible(),
  shipping: f.object(FlexAddress).optional().flexible(),
  tags: f.object(FlexAddress).array().flexible(),
  profile: f.object(FlexProfile),
  strictAddress: f.object(FlexAddress),
});
