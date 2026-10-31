import { f, model } from '../../../../../src/schema';

export const Registered = model('Registered', { id: f.record().id() });
