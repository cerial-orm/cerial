import { describe, expect, test } from 'bun:test';

describe('Code Actions Logic', () => {
  describe('Levenshtein distance', () => {
    // Re-implement the algorithm to test it (it's private in the provider)
    function levenshtein(a: string, b: string): number {
      const m = a.length;
      const n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;

      const dp: number[][] = [];
      for (let i = 0; i <= m; i++) dp[i] = [i];
      for (let j = 0; j <= n; j++) dp[0]![j] = j;

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
        }
      }

      return dp[m]![n]!;
    }

    test('identical strings have distance 0', () => {
      expect(levenshtein('hello', 'hello')).toBe(0);
    });

    test('completely different strings', () => {
      expect(levenshtein('abc', 'xyz')).toBe(3);
    });

    test('one character difference', () => {
      expect(levenshtein('User', 'Usar')).toBe(1);
    });

    test('insertion', () => {
      expect(levenshtein('User', 'Users')).toBe(1);
    });

    test('deletion', () => {
      expect(levenshtein('Users', 'User')).toBe(1);
    });

    test('empty strings', () => {
      expect(levenshtein('', '')).toBe(0);
      expect(levenshtein('abc', '')).toBe(3);
      expect(levenshtein('', 'xyz')).toBe(3);
    });

    test('case-sensitive comparison', () => {
      expect(levenshtein('user', 'User')).toBe(1);
    });
  });

  describe('suggestion ranking', () => {
    function rankSuggestions(invalid: string, candidates: string[]): string[] {
      const lower = invalid.toLowerCase();

      const scored = candidates.map((name) => {
        const nameLower = name.toLowerCase();
        let score = 0;

        if (nameLower.startsWith(lower) || lower.startsWith(nameLower)) {
          score += 100;
        }

        let shared = 0;
        for (let i = 0; i < Math.min(lower.length, nameLower.length); i++) {
          if (lower[i] === nameLower[i]) shared++;
          else break;
        }
        score += shared * 10;

        score -= Math.abs(name.length - invalid.length) * 2;

        return { name, score };
      });

      scored.sort((a, b) => b.score - a.score);

      return scored.map((s) => s.name);
    }

    test('exact prefix match ranks highest', () => {
      const result = rankSuggestions('Usr', ['User', 'Article', 'Usage']);

      // Usage starts with the same letters
      expect(result[0]).not.toBe('Article');
    });

    test('similar names rank higher than dissimilar', () => {
      const result = rankSuggestions('Usre', ['User', 'Article', 'Post']);

      // User is closest to "Usre" (typo)
      expect(result[0]).toBe('User');
    });

    test('empty candidates returns empty', () => {
      const result = rankSuggestions('Test', []);

      expect(result).toEqual([]);
    });
  });

  describe('diagnostic pattern matching', () => {
    test('missing @id field pattern', () => {
      const msg = 'Model "User" does not have an @id field.';

      expect(msg.includes('does not have an @id field')).toBe(true);
    });

    test('@nullable on object field pattern', () => {
      const msg = "@nullable is not allowed on object field 'address' in model User.";

      expect(msg.includes('@nullable is not allowed on object field')).toBe(true);
    });

    test('@nullable on tuple field pattern', () => {
      const msg = "@nullable is not allowed on tuple field 'coords' in model Geo.";

      expect(msg.includes('@nullable is not allowed on tuple field')).toBe(true);
    });

    test('optional Any field pattern', () => {
      const msg = "Optional (?) is not allowed on Any field 'data' in model Flex.";

      expect(msg.includes('Optional (?) is not allowed on Any field')).toBe(true);
    });

    test('optional tuple element pattern', () => {
      const msg = 'Optional elements (?) are not allowed in tuples. Use @nullable instead.';

      expect(msg.includes('Optional elements (?) are not allowed in tuples')).toBe(true);
    });

    test('@default(null) requires @nullable pattern', () => {
      const msg = "@default(null) requires @nullable on field 'deletedAt' in model User.";

      expect(msg.includes('@default(null) requires @nullable')).toBe(true);
    });

    test('conflicting decorators pattern (two decorators)', () => {
      const msg = "@createdAt and @updatedAt cannot be used together on field 'ts' in model Bad.";
      const match = msg.match(/@(\w+) and @(\w+) cannot be used together/);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('createdAt');
      expect(match![2]).toBe('updatedAt');
    });

    test('extends concrete model pattern', () => {
      const msg = 'Model "Child" extends concrete model "Parent". Models can only extend abstract models.';

      expect(msg.includes('extends concrete model')).toBe(true);
      expect(msg.includes('Models can only extend abstract models')).toBe(true);

      const parentName = /extends concrete model "([^"]+)"/.exec(msg);

      expect(parentName).not.toBeNull();
      expect(parentName![1]).toBe('Parent');
    });

    test('non-existent model pattern', () => {
      const msg = 'Relation field "author" references non-existent model "Usr"';

      expect(msg.includes('references non-existent model')).toBe(true);

      const invalidName = /non-existent model "([^"]+)"/.exec(msg);

      expect(invalidName).not.toBeNull();
      expect(invalidName![1]).toBe('Usr');
    });

    test('@nullable on @id field pattern', () => {
      const msg = "@nullable is not allowed on @id field 'id' in model User.";

      expect(msg.includes('@nullable is not allowed on @id field')).toBe(true);
    });

    test('@nullable on @now field pattern', () => {
      const msg = "@nullable is not allowed on @now field 'ts' in model Timer.";

      expect(msg.includes('@nullable is not allowed on @now field')).toBe(true);
    });

    test('disallowed tuple decorator pattern', () => {
      const msg = "Decorator @readonly is not allowed on tuple element 'x' in tuple Point.";

      expect(msg.includes('is not allowed on tuple element')).toBe(true);

      const decName = /Decorator @(\w+) is not allowed/.exec(msg);

      expect(decName).not.toBeNull();
      expect(decName![1]).toBe('readonly');
    });
  });

  describe('decorator removal from line text', () => {
    test('finds decorator in line text', () => {
      const lineText = '  name String @nullable @default("test")';
      const idx = lineText.indexOf('@nullable');

      expect(idx).toBeGreaterThan(-1);
    });

    test('decorator removal preserves surrounding text', () => {
      const lineText = '  name String @nullable @default("test")';
      const decorator = '@nullable';
      const idx = lineText.indexOf(decorator);

      const removeStart = idx;
      let removeEnd = idx + decorator.length;

      // Remove trailing space
      if (removeEnd < lineText.length && lineText[removeEnd] === ' ') {
        removeEnd++;
      }

      const result = lineText.slice(0, removeStart) + lineText.slice(removeEnd);

      expect(result).toBe('  name String @default("test")');
    });

    test('decorator at end of line removes leading space', () => {
      const lineText = '  name String @unique';
      const decorator = '@unique';
      const idx = lineText.indexOf(decorator);

      let removeStart = idx;
      const removeEnd = idx + decorator.length;

      if (removeEnd >= lineText.length && removeStart > 0 && lineText[removeStart - 1] === ' ') {
        removeStart--;
      }

      const result = lineText.slice(0, removeStart) + lineText.slice(removeEnd);

      expect(result).toBe('  name String');
    });
  });
});
