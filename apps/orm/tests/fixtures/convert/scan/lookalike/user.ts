import { f, model } from './src/schema';

export const User = model('User', { name: f.string() });
