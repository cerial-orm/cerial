import { f, model } from '../../../../../src/schema';

export const Convention = model('Convention', { id: f.record().id() });
