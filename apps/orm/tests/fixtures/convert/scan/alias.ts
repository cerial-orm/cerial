import * as s from 'cerial/schema';
import { f as fields, model as build } from 'cerial/schema';
import { model as viaBarrel } from './barrel';

export const ByNamespace = s.model('ByNamespace', { id: s.f.record().id() });
export const ByAlias = build('ByAlias', { id: fields.record().id(), name: fields.string() });
export const ByBarrel = viaBarrel('ByBarrel', { id: fields.record().id() });
