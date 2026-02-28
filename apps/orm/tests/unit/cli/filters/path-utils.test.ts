import { describe, expect, it } from 'bun:test';
import { isSubPath, normalizePath, toFilterPath } from '../../../../src/cli/filters/path-utils';

const isWindows = process.platform === 'win32';

describe('path-utils', () => {
  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      const result = normalizePath('D:\\projects\\schemas\\user.cerial');

      expect(result).toBe('D:/projects/schemas/user.cerial');
    });

    it('should leave forward slashes unchanged', () => {
      const result = normalizePath('already/forward/slash');

      expect(result).toBe('already/forward/slash');
    });

    it('should strip trailing slash', () => {
      const result = normalizePath('trailing/slash/');

      expect(result).toBe('trailing/slash');
    });

    it('should handle empty string', () => {
      const result = normalizePath('');

      expect(result).toBe('');
    });

    it('should handle mixed separators', () => {
      const result = normalizePath('D:\\projects/schemas\\user.cerial');

      expect(result).toBe('D:/projects/schemas/user.cerial');
    });

    it('should handle multiple trailing slashes', () => {
      const result = normalizePath('path/to/dir///');

      expect(result).toBe('path/to/dir');
    });
  });

  describe('toFilterPath', () => {
    it.skipIf(!isWindows)('should convert absolute path to relative with forward slashes', () => {
      const result = toFilterPath('D:\\projects\\schemas\\user.cerial', 'D:\\projects\\schemas');

      expect(result).toBe('user.cerial');
    });

    it('should handle unix-style paths', () => {
      const result = toFilterPath('/home/user/schemas/auth/model.cerial', '/home/user/schemas');

      expect(result).toBe('auth/model.cerial');
    });

    it('should return empty string for same path', () => {
      const result = toFilterPath('/same/path', '/same/path');

      expect(result).toBe('');
    });

    it.skipIf(!isWindows)('should normalize backslashes in result', () => {
      const result = toFilterPath('D:\\root\\schemas\\auth\\model.cerial', 'D:\\root\\schemas');

      expect(result).toBe('auth/model.cerial');
    });

    it('should handle nested relative paths', () => {
      const result = toFilterPath('/root/schemas/auth/admin/user.cerial', '/root/schemas');

      expect(result).toBe('auth/admin/user.cerial');
    });
  });

  describe('isSubPath', () => {
    it('should return true for direct child path', () => {
      const result = isSubPath('/root/schemas/auth', '/root/schemas');

      expect(result).toBe(true);
    });

    it('should return true for same path', () => {
      const result = isSubPath('/root/schemas', '/root/schemas');

      expect(result).toBe(true);
    });

    it('should return false for sibling path', () => {
      const result = isSubPath('/root/other', '/root/schemas');

      expect(result).toBe(false);
    });

    it('should return false for prefix match without path separator', () => {
      const result = isSubPath('/root/schemas-extra', '/root/schemas');

      expect(result).toBe(false);
    });

    it('should handle windows backslash paths', () => {
      const result = isSubPath('D:\\root\\schemas\\auth', 'D:\\root\\schemas');

      expect(result).toBe(true);
    });

    it('should handle nested deep paths', () => {
      const result = isSubPath('/root/schemas/auth/admin/user', '/root/schemas');

      expect(result).toBe(true);
    });

    it('should return false for parent path', () => {
      const result = isSubPath('/root', '/root/schemas');

      expect(result).toBe(false);
    });

    it('should handle mixed separators', () => {
      const result = isSubPath('D:\\root/schemas\\auth', 'D:\\root/schemas');

      expect(result).toBe(true);
    });
  });
});
