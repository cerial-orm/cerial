import { describe, expect, test } from 'bun:test';
import { createChain } from '../../../../src/parser/builder';
import { DECORATOR_REGISTRY } from '../../../../src/parser/registry';
import { registryOf, SYNTHETIC_CHAIN_ENTRY } from './helpers';

describe('builder derivation from the registry', () => {
  test('a synthetic registry entry yields a chain method with no edit to the builder', () => {
    const registry = registryOf(SYNTHETIC_CHAIN_ENTRY);
    const chain = createChain('modelField', { registry });

    expect(typeof chain.distinct).toBe('function');
    expect(chain.distinct().decorators()).toMatchObject([{ type: 'distinct', value: 'synthetic' }]);
  });

  test('a registry without the entry has no such method, and the global map is untouched', () => {
    const sizeBefore = DECORATOR_REGISTRY.size;
    const chain = createChain('modelField', { registry: registryOf() });

    expect('distinct' in chain).toBe(false);
    expect(DECORATOR_REGISTRY.size).toBe(sizeBefore);
  });

  test('an entry not legal on the target gets no method there', () => {
    const chain = createChain('tupleElement', { registry: registryOf(SYNTHETIC_CHAIN_ENTRY) });

    expect('distinct' in chain).toBe(false);
  });

  test('the default registry gives every chainable field entry a method on each of its targets', () => {
    for (const entry of DECORATOR_REGISTRY.values()) {
      if (entry.args.kind === 'nameAndFields' || entry.name === '@model') continue;
      for (const target of entry.targets) {
        const chain = createChain(target, { kind: 'relation' });

        expect(entry.name.slice(1) in chain).toBe(true);
      }
    }
  });

  test('calls are immutable: chaining returns a new chain and the base is unchanged', () => {
    const base = createChain('modelField').unique();
    const extended = base.index();

    expect(base.decorators()).toHaveLength(1);
    expect(extended.decorators()).toHaveLength(2);
  });
});
