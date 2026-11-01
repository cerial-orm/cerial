import { f, model } from 'cerial/schema';

const big = process.env.BIG === '1';

export const Maybe = model('Maybe', { id: f.record().id(), extra: big ? f.string() : f.int() });
