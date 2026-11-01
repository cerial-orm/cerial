import { f, model } from 'cerial/schema';

const CONFIG = { x: 'value' };

export const Configured = model('Configured', { id: f.record().id(), name: f.string().default(CONFIG.x) });
