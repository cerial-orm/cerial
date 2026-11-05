import { describe, expect, it } from 'bun:test';
import { generateEnumConst } from '../../../src/generators/types/enums/interface-generator';
import type { LiteralMetadata } from '../../../src/types';

const enumOf = (...values: string[]): LiteralMetadata =>
  ({ name: 'Role', variants: values.map((value) => ({ kind: 'string', value })) }) as unknown as LiteralMetadata;

describe('generated enum const keys', () => {
  it('keeps a value named toString as an own member', async () => {
    const code = generateEnumConst(enumOf('toString', 'valueOf'));
    const Role = new Function(
      `${code.replace('export const', 'const').replace(' as const', '')}; return RoleEnum;`,
    )() as Record<string, string>;

    expect(Object.keys(Role)).toEqual(['toString', 'valueOf']);
    expect(Object.getOwnPropertyDescriptor(Role, 'toString')?.value).toBe('toString');
  });

  it('keeps a value named __proto__ as an own member', () => {
    const code = generateEnumConst(enumOf('__proto__', 'A'));
    const Role = new Function(
      `${code.replace('export const', 'const').replace(' as const', '')}; return RoleEnum;`,
    )() as Record<string, string>;

    expect(Object.keys(Role)).toEqual(['__proto__', 'A']);
  });
});
