import { f, model } from 'cerial/schema';

const sharedField = f.string();

export const Shared = model('Shared', { id: f.record().id(), name: sharedField });
