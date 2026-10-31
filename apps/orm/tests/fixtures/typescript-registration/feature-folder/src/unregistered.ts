import { f, model } from '../../../../../src/schema';

// Nothing imports this module, so registration never sees it
export const Ghost = model('Ghost', { id: f.record().id() });
