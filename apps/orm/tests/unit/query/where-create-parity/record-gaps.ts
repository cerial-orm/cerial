/**
 * Rewrites known-gaps.ts from what the oracle finds today:
 *   bun tests/unit/query/where-create-parity/record-gaps.ts
 * Run it after a fix lands so the entries it closed drop out, and read the diff: a new line is a regression.
 */

import { join } from 'node:path';
import { operandFindings, shapeTally } from './gaps';
import { SLOTS } from './slots';

const all: Record<string, number> = { ...shapeTally() };
for (const slot of SLOTS) Object.assign(all, operandFindings(slot.id));

const rows = Object.entries(all)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([key, count]) => `  ${JSON.stringify(key)}: ${count},`);

const header = `/**
 * What the where operand path still gets wrong against create, as the oracle measures it today.
 *
 * A key is \`<kind of disagreement>|<slot>|<operand>\` and its value is how many (path, operator) places
 * disagree. The oracle test compares the measured counts with this list both ways: a new disagreement or a
 * larger count is a regression, and a gap that is fixed fails the test until its entry is removed here.
 * Regenerate with \`bun tests/unit/query/where-create-parity/record-gaps.ts\` and read the diff.
 */

export const KNOWN_GAPS: Readonly<Record<string, number>> = {
${rows.join('\n')}
};
`;

await Bun.write(join(import.meta.dir, 'known-gaps.ts'), header);
console.log(`${rows.length} known gaps`);
