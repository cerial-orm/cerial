import { f, model } from 'cerial/schema';

const compute = (): string => 'computed';

export const Computed = model('Computed', { id: f.record().id(), name: f.string().default(compute()) });
