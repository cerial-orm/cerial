import { f, model } from 'cerial/schema';

export const Inner = model('Inner', { id: f.record().id(), name: f.string().default(String(Math.random())) });
