import { f, model } from 'cerial/schema';

const base = f.string().default('x');

export const Partial = model('Partial', { id: f.record().id(), name: base.optional() });
