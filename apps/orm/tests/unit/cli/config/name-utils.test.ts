/**
 * Name utils tests
 */

import { describe, expect, it } from 'bun:test';
import { toClientClassName } from '../../../../src/cli/config';

describe('toClientClassName', () => {
  it('should convert simple schema name to PascalCase', () => {
    expect(toClientClassName('auth')).toBe('AuthCerialClient');
  });

  it('should convert kebab-case to PascalCase', () => {
    expect(toClientClassName('my-auth')).toBe('MyAuthCerialClient');
  });

  it('should convert snake_case to PascalCase', () => {
    expect(toClientClassName('auth_v2')).toBe('AuthV2CerialClient');
  });

  it('should handle numbers in schema name', () => {
    expect(toClientClassName('posts123')).toBe('Posts123CerialClient');
  });

  it('should handle mixed separators', () => {
    expect(toClientClassName('my_auth-v2')).toBe('MyAuthV2CerialClient');
  });

  it('should return default for undefined', () => {
    expect(toClientClassName(undefined)).toBe('CerialClient');
  });

  it('should return default for null', () => {
    expect(toClientClassName(null as any)).toBe('CerialClient');
  });

  it('should return default for empty string', () => {
    expect(toClientClassName('')).toBe('CerialClient');
  });

  it('should handle single character', () => {
    expect(toClientClassName('a')).toBe('ACerialClient');
  });

  it('should handle already PascalCase', () => {
    expect(toClientClassName('Auth')).toBe('AuthCerialClient');
  });

  it('should handle multiple consecutive separators', () => {
    expect(toClientClassName('my__auth--v2')).toBe('MyAuthV2CerialClient');
  });
});
