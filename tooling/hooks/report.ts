// How a refusal reaches the person who tried to commit.

import type { Refusal } from './scan.ts';

/** Prints every refusal, grouped by gate, and says how many there were. */
export function printRefusals(header: string, refusals: readonly Refusal[]): void {
  const out: string[] = ['', header, ''];
  for (const refusal of refusals) {
    out.push(`  ${refusal.gate}  ${refusal.where}`);
    if (refusal.line.length > 0) out.push(`    ${refusal.line}`);
    out.push(`    ${refusal.hint}`);
    out.push('');
  }
  const count = refusals.length;
  out.push(`${count} refusal${count === 1 ? '' : 's'}.`);
  out.push('');
  process.stderr.write(out.join('\n'));
}
