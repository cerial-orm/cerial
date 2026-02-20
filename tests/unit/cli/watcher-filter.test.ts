import { describe, expect, it } from 'bun:test';
import type { PathFilter } from '../../../src/cli/filters/types';
import {
  isCerialFile,
  isCerialIgnoreFile,
  shouldTriggerRegeneration,
  type WatchTarget,
} from '../../../src/cli/watcher';

describe('watcher filter integration', () => {
  describe('isCerialFile with .cerialignore', () => {
    it('should return false for .cerialignore', () => {
      expect(isCerialFile('.cerialignore')).toBe(false);
    });
  });

  describe('isCerialIgnoreFile', () => {
    it('should return true for .cerialignore', () => {
      expect(isCerialIgnoreFile('.cerialignore')).toBe(true);
    });

    it('should return true for nested .cerialignore', () => {
      expect(isCerialIgnoreFile('sub/.cerialignore')).toBe(true);
    });

    it('should return false for .cerial files', () => {
      expect(isCerialIgnoreFile('file.cerial')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isCerialIgnoreFile(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isCerialIgnoreFile('')).toBe(false);
    });

    it('should return false for similar names', () => {
      expect(isCerialIgnoreFile('.cerialignore.bak')).toBe(false);
      expect(isCerialIgnoreFile('cerialignore')).toBe(false);
    });
  });

  describe('shouldTriggerRegeneration', () => {
    const includeAllFilter: PathFilter = {
      shouldInclude: () => true,
    };

    const excludeAllFilter: PathFilter = {
      shouldInclude: () => false,
    };

    const selectiveFilter: PathFilter = {
      shouldInclude: (path: string) => !path.startsWith('internal/'),
    };

    describe('without filter', () => {
      it('should trigger for .cerial file changes', () => {
        expect(shouldTriggerRegeneration('schema.cerial')).toBe(true);
      });

      it('should trigger for nested .cerial file changes', () => {
        expect(shouldTriggerRegeneration('models/user.cerial')).toBe(true);
      });

      it('should not trigger for non-.cerial files', () => {
        expect(shouldTriggerRegeneration('file.ts')).toBe(false);
      });

      it('should not trigger for null filename', () => {
        expect(shouldTriggerRegeneration(null)).toBe(false);
      });

      it('should trigger for .cerialignore changes', () => {
        expect(shouldTriggerRegeneration('.cerialignore')).toBe(true);
      });
    });

    describe('with filter that excludes all', () => {
      it('should NOT trigger for excluded .cerial files', () => {
        expect(shouldTriggerRegeneration('schema.cerial', excludeAllFilter)).toBe(false);
      });

      it('should ALWAYS trigger for .cerialignore changes', () => {
        expect(shouldTriggerRegeneration('.cerialignore', excludeAllFilter)).toBe(true);
      });

      it('should ALWAYS trigger for nested .cerialignore changes', () => {
        expect(shouldTriggerRegeneration('sub/.cerialignore', excludeAllFilter)).toBe(true);
      });
    });

    describe('with filter that includes all', () => {
      it('should trigger for .cerial files', () => {
        expect(shouldTriggerRegeneration('schema.cerial', includeAllFilter)).toBe(true);
      });

      it('should trigger for .cerialignore changes', () => {
        expect(shouldTriggerRegeneration('.cerialignore', includeAllFilter)).toBe(true);
      });
    });

    describe('with selective filter', () => {
      it('should trigger for included .cerial files', () => {
        expect(shouldTriggerRegeneration('public/user.cerial', selectiveFilter)).toBe(true);
      });

      it('should NOT trigger for excluded .cerial files', () => {
        expect(shouldTriggerRegeneration('internal/secret.cerial', selectiveFilter)).toBe(false);
      });

      it('should ALWAYS trigger for .cerialignore regardless of filter', () => {
        expect(shouldTriggerRegeneration('.cerialignore', selectiveFilter)).toBe(true);
      });

      it('should not trigger for non-.cerial files even if filter would include them', () => {
        expect(shouldTriggerRegeneration('public/readme.md', selectiveFilter)).toBe(false);
      });
    });

    describe('Windows path normalization', () => {
      it('should normalize backslashes before checking filter', () => {
        const pathTracker: string[] = [];
        const trackingFilter: PathFilter = {
          shouldInclude: (path: string) => {
            pathTracker.push(path);

            return true;
          },
        };

        shouldTriggerRegeneration('models\\user.cerial', trackingFilter);
        expect(pathTracker[0]).toBe('models/user.cerial');
      });
    });
  });

  describe('WatchTarget with filter', () => {
    it('should accept optional filter field', () => {
      const filter: PathFilter = { shouldInclude: () => true };
      const target: WatchTarget = {
        schemaPath: './schemas',
        outputDir: './generated',
        filter,
      };

      expect(target.filter).toBe(filter);
    });

    it('should work without filter field', () => {
      const target: WatchTarget = {
        schemaPath: './schemas',
        outputDir: './generated',
      };

      expect(target.filter).toBeUndefined();
    });
  });
});
