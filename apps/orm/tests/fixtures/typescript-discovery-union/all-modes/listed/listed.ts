import { f, model } from '../../../../../src/schema';

export const Listed = model('Listed', { id: f.record().id() });
