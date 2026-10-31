import { f, model } from '../../../../src/schema';

export const Customer = model('Customer', {
  id: f.record().id(),
  name: f.string(),
  orders: f.reverse('PurchaseOrder').array(),
});

export const Agent = model('Agent', {
  id: f.record().id(),
  name: f.string(),
  assignedOrders: f.reverse('PurchaseOrder').array(),
});

export const PurchaseOrder = model('PurchaseOrder', {
  id: f.record().id(),
  orderNumber: f.string().unique(),
  customerId: f.record(),
  customer: f.relation('Customer').field('customerId'),
  assigneeId: f.record().optional().nullable(),
  assignee: f.relation('Agent').optional().field('assigneeId'),
});
