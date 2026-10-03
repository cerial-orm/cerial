/**
 * Unit Tests: literal variant identity
 *
 * The resolver filter, the inheritance dedup and the extends validator all key
 * variants by getVariantIdentity, so a pick list that names a variant by its
 * identity must pass validation and survive resolution for every variant kind.
 */

import { describe, expect, test } from 'bun:test';
import { validatePickOmitFields } from '../../../src/cli/validators/extends-validator';
import { getVariantIdentity, resolveInheritance } from '../../../src/resolver';
import type { ASTLiteralVariant } from '../../../src/types';
import { ast, literal } from './helpers';

const variants: Record<ASTLiteralVariant['kind'], { variant: ASTLiteralVariant; identity: string }> = {
  string: { variant: { kind: 'string', value: 'low' }, identity: "'low'" },
  int: { variant: { kind: 'int', value: 3 }, identity: '3' },
  float: { variant: { kind: 'float', value: 1.5 }, identity: '1.5' },
  bool: { variant: { kind: 'bool', value: true }, identity: 'true' },
  broadType: { variant: { kind: 'broadType', typeName: 'Int' }, identity: 'Int' },
  tupleRef: { variant: { kind: 'tupleRef', tupleName: 'Point' }, identity: 'Point' },
  objectRef: { variant: { kind: 'objectRef', objectName: 'Address' }, identity: 'Address' },
  literalRef: { variant: { kind: 'literalRef', literalName: 'Level' }, identity: 'Level' },
};

describe('getVariantIdentity', () => {
  for (const [kind, { variant, identity }] of Object.entries(variants)) {
    test(`${kind}: identity is ${identity}`, () => {
      expect(getVariantIdentity(variant)).toBe(identity);
    });

    test(`${kind}: validator accepts the identity and the resolver keeps the variant`, () => {
      const input = ast({
        literals: [
          literal('Base', [variant, { kind: 'string', value: 'other' }]),
          literal('Child', [], { extends: 'Base', extendsFilter: { mode: 'pick', fields: [identity] } }),
        ],
      });

      expect(validatePickOmitFields(input)).toEqual([]);
      const child = resolveInheritance(input).literals.find((l) => l.name === 'Child')!;
      expect(child.variants).toEqual([variant]);
    });

    test(`${kind}: omit by identity removes only that variant`, () => {
      const input = ast({
        literals: [
          literal('Base', [variant, { kind: 'string', value: 'other' }]),
          literal('Child', [], { extends: 'Base', extendsFilter: { mode: 'omit', fields: [identity] } }),
        ],
      });

      expect(validatePickOmitFields(input)).toEqual([]);
      const child = resolveInheritance(input).literals.find((l) => l.name === 'Child')!;
      expect(child.variants).toEqual([{ kind: 'string', value: 'other' }]);
    });
  }

  test('a bare string name is rejected by the validator', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'string', value: 'low' }]),
        literal('Child', [], { extends: 'Base', extendsFilter: { mode: 'pick', fields: ['low'] } }),
      ],
    });

    expect(validatePickOmitFields(input)).not.toEqual([]);
  });
});
