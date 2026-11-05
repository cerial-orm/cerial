import { describe, expect, test } from 'bun:test';
import { generateRegistryCode } from '../../../src/generators/metadata/registry-generator';
import type { ModelMetadata } from '../../../src/types';
import { field } from './helpers';

function registryFor(...recordIdTypes: string[]): string {
  const model: ModelMetadata = {
    name: 'M',
    tableName: 'm',
    fields: [field({ name: 'r', type: 'record', recordIdTypes })],
  };

  return generateRegistryCode([model]);
}

/** Evaluate the registry body (minus its type-only import and annotation) the way the generated module does */
function evaluate(code: string): { M: { fields: Array<{ recordIdTypes?: string[] }> } } {
  const body = code
    .replace(/^import type .*$/m, '')
    .replace(/export const (\w+): \w+ =/, 'return')
    .replace(/^export type .*$/m, '');

  return new Function(body)();
}

describe('registry recordIdTypes escaping', () => {
  test('a type containing a quote stays one string and runs nothing', () => {
    const payload = "x'+[globalThis.PWNED_UNIT=1]+'";
    const registry = evaluate(registryFor(payload));

    expect(registry.M?.fields[0]?.recordIdTypes).toEqual([payload]);
    expect((globalThis as Record<string, unknown>).PWNED_UNIT).toBeUndefined();
  });

  test('plain names are emitted unchanged', () => {
    expect(registryFor('string', 'int')).toContain("recordIdTypes: ['string', 'int']");
  });
});
