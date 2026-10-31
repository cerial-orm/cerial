import { f, model } from '../../../../../src/schema';

export const Handled = model('Handled', { id: f.record().id() });
