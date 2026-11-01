import { f, model } from 'cerial/schema';

const big = process.env.BIG === '1';

export const Choice = big
  ? model('Choice', { id: f.record().id(), name: f.string() })
  : model('Choice', { id: f.record().id() });
