import { f as builder } from 'cerial/schema';

export const f = {
  string: () => builder.string().default(process.env.NAME ?? 'x'),
};
export { model } from 'cerial/schema';
