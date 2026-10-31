import { f, model, object } from '../../../../src/schema';

export const Address = object('Address', {
  street: f.string(),
  city: f.string(),
  state: f.string(),
  zipCode: f.string().optional().nullable(),
});

export const GeoPoint = object('GeoPoint', {
  lat: f.float(),
  lng: f.float(),
  label: f.object(Address).optional(),
});

export const TreeNode = object('TreeNode', {
  payload: f.int(),
  children: f.object('TreeNode').array(),
});

export const OrderItem = object('OrderItem', {
  productName: f.string(),
  quantity: f.int(),
  price: f.float(),
  tags: f.string().array(),
});

export const ObjectTestUser = model('ObjectTestUser', {
  id: f.record().id(),
  name: f.string(),
  address: f.object(Address),
  shipping: f.object(Address).optional(),
  locations: f.object(GeoPoint).array(),
  primaryLocation: f.object(GeoPoint).optional(),
});

export const ObjectTestOrder = model('ObjectTestOrder', {
  id: f.record().id(),
  billingAddress: f.object(Address),
  shippingAddress: f.object(Address).optional(),
  items: f.object(OrderItem).array(),
  metadata: f.object(TreeNode).optional(),
});
