import { f, model } from '../../../../../src/schema';

export const Shared = model('Shared', { id: f.record().id() });
