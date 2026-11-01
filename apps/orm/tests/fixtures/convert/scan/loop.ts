import { f, model } from 'cerial/schema';

export const [Alpha, Beta] = ['Alpha', 'Beta'].map((name) => model(name, { id: f.record().id() }));
