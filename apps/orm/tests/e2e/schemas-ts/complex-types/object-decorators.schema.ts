import { f, model, object } from '../../../../src/schema';

export const ContactInfo = object('ContactInfo', {
  email: f.email(),
  phone: f.string().optional().nullable(),
  city: f.string().default('Unknown'),
  createdAt: f.date().createdAt(),
  tags: f.string().array().distinct(),
});

export const LocationInfo = object('LocationInfo', {
  address: f.string(),
  zip: f.string().unique(),
  country: f.string().index(),
});

export const ObjDecUser = model('ObjDecUser', {
  id: f.record().id(),
  name: f.string(),
  contact: f.object(ContactInfo),
  location: f.object(LocationInfo),
  altLocation: f.object(LocationInfo).optional(),
});
