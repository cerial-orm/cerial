// Decision (D) and finding (F) ids as references, one form at a time. The
// fixtures are assembled from pieces so this file does not trip its own scan.

import { describe, expect, test } from 'bun:test';
import { scanTracker } from './scan.ts';

const SHIPPING = 'apps/orm/src/query/thing.ts';
const id = (letter: string, n: number): string => `${letter}${n}`;
const d = (n: number): string => id('D', n);
const f = (n: number): string => id('F', n);

const REFUSED: Readonly<Record<string, string>> = {
  'parenthesised decision': `// chosen (${d(35)})`,
  'parenthesised finding': `describe('config built from data (${f(9)})', () => {})`,
  'decision list': `// rests on ${d(14)}, ${d(21)}`,
  'finding list with and': `// covers ${f(1)}, ${f(12)} and the naming half`,
  'finding before a colon': `/** ${f(14)}: names that differ only in case */`,
  'decision before a colon': `// ${d(35)}: private fields`,
  'cited by enforce': `// Resolution does not enforce ${d(35)} here`,
  'cited by enforces': `// validatePrivateOverride enforces ${d(35)}`,
  'cited by see': `// see ${f(9)} for why`,
  'decision moved': `// ${d(47)} moved the earlier rule`,
  'the shape': `label: 'reverse none: the ${f(25)} shape'`,
  'the payload': `it('refuses the ${f(3)} payload', () => {})`,
};

const PASSES: Readonly<Record<string, string>> = {
  'decision as a quoted value': `data: { name: '${d(1)}', role: 'ADMIN' }`,
  'finding as a quoted value': `where: { code: '${f(1)}' }`,
  'quoted values in a list': `['${d(1)}', '${d(2)}']`,
  'sized float class': `if (type === 'float16') return new ${f(16)}(value);`,
  'sized float import': `import { Decimal, ${f(16)}, ${f(32)}, Geometry } from 'surrealdb';`,
  'sized float in prose': `bind as ${f(16)} and ${f(32)} so 0.1 finds the row`,
  'key in prose': `Press **${f(2)}** on a type name to rename it`,
  'key in parentheses with a name': `Rename Symbol (${f(2)}) renames a type`,
  'key chord': `Shift+${f(12)} shows every usage`,
  'key after a slash': `Ctrl+Click / ${f(12)} navigation`,
  'key with a modifier word': `Ctrl+Click (or ${f(12)}) jumps to the definition`,
  'error code': `error E-DB-${d(12)} is raised`,
  'ordinary word': 'Date 2026 and Dec 12 and a Dress',
};

describe('decision and finding ids as references', () => {
  for (const [name, line] of Object.entries(REFUSED)) {
    test(`refuses ${name}`, () => {
      expect(scanTracker(SHIPPING, line).map((r) => r.rule)).toEqual(['tracker.decision-id']);
    });
  }

  for (const [name, line] of Object.entries(PASSES)) {
    test(`lets through ${name}`, () => {
      expect(scanTracker(SHIPPING, line)).toEqual([]);
    });
  }
});
