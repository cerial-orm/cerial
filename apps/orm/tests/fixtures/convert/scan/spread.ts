import { f, model } from 'cerial/schema';

const timestamps = { createdAt: f.date().createdAt(), updatedAt: f.date().updatedAt() };

export const Spread = model('Spread', { id: f.record().id(), ...timestamps });
