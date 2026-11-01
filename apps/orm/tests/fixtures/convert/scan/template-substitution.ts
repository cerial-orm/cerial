import { f, model } from 'cerial/schema';

const word = 'x';

export const Templated = model('Templated', { id: f.record().id(), name: f.string().default(`a-${word}`) });
