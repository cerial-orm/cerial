import { f, model } from 'cerial/schema';
// @ts-expect-error -- the package is deliberately not installed
import { timestamps } from 'cerial-shared-fields';

export const Packaged = model('Packaged', { id: f.record().id(), ...timestamps });
