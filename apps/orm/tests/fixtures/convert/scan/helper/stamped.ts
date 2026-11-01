import { f, model } from 'cerial/schema';

export function makeStamped() {
  return model('Stamped', { id: f.record().id(), at: f.int().default(Date.now()) });
}
