import { f, model } from 'cerial/schema';

class Seed {
  toString(): string {
    return 'seed';
  }
}

export const Seeded = model('Seeded', { id: f.record().id(), name: f.string().default(new Seed().toString()) });
