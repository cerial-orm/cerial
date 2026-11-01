import { f, model } from 'cerial/schema';

export function makeUser() {
  return model('User', { id: f.record().id(), name: f.string() });
}
