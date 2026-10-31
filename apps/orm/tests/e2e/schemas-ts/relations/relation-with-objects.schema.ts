import { f, model, object } from '../../../../src/schema';
import { Address } from '../complex-types/objects.schema';

export const CompanyMeta = object('CompanyMeta', {
  industry: f.string(),
  founded: f.int().optional(),
});

export const RelObjCompany = model('RelObjCompany', {
  id: f.record().id(),
  name: f.string(),
  headquarters: f.object(Address),
  meta: f.object(CompanyMeta).optional(),
  employees: f.reverse('RelObjEmployee').array(),
});

export const RelObjEmployee = model('RelObjEmployee', {
  id: f.record().id(),
  name: f.string(),
  homeAddress: f.object(Address),
  companyId: f.record(),
  company: f.relation('RelObjCompany').field('companyId'),
});
