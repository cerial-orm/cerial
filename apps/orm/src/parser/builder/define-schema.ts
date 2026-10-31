import { CerialGenerationError } from '../../errors';
import type { Handle } from './handle';
import { isModelHandle } from './model';
import { sharedWeakSet } from './shared-state';

/** What `defineSchema` returns: the models an entry module registers, exported so generation can find it. */
export interface SchemaRegistration {
  readonly models: readonly Handle<string, unknown>[];
}

// The package can load twice, so a registration made by one copy must be recognisable to the other.
const REGISTRATIONS = sharedWeakSet('schema.registrations');

/** Whether `value` was returned by `defineSchema`. */
export function isSchemaRegistration(value: unknown): value is SchemaRegistration {
  return typeof value === 'object' && value !== null && REGISTRATIONS.has(value);
}

/**
 * Mark a module as a schema entry. Generation imports the modules this one imports and treats their
 * exports as registered, whatever they are named. Every listed model must also be an exported binding, so
 * an error can name where it was declared; the check runs at generation, once the exports are known.
 */
export function defineSchema(input: { readonly models: readonly Handle<string, unknown>[] }): SchemaRegistration {
  const models: unknown = input?.models;
  if (!Array.isArray(models)) {
    throw new CerialGenerationError('defineSchema: "models" must be an array of models declared with model()');
  }

  models.forEach((item: unknown, index) => {
    if (typeof item === 'object' && item !== null && isModelHandle(item)) return;

    const found = Array.isArray(item) ? 'an array' : item === null ? 'null' : typeof item;
    throw new CerialGenerationError(
      `defineSchema: models[${index}] is ${found}, not a model declared with model(). Only models are listed; objects, tuples, literals and enums are registered by being imported.`,
    );
  });

  const registration: SchemaRegistration = Object.freeze({ models: Object.freeze([...models]) });
  REGISTRATIONS.add(registration);

  return registration;
}
