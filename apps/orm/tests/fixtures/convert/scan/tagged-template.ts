import { f, model } from 'cerial/schema';

const tag = (parts: TemplateStringsArray): string => parts.join('');

export const Tagged = model('Tagged', { id: f.record().id(), name: f.string().default(tag`x`) });
