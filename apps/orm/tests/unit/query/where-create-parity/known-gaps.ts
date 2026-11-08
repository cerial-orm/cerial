/**
 * What the where operand path still gets wrong against create, as the oracle measures it. It is empty: the
 * oracle test pins zero disagreements, so any new one fails.
 *
 * A key is `<kind of disagreement>|<slot>|<operand>` and its value is how many (path, operator) places
 * disagree. The oracle test compares the measured counts with this list both ways: a new disagreement or a
 * larger count is a regression, and a gap that is fixed fails the test until its entry is removed here.
 * Regenerate with `bun tests/unit/query/where-create-parity/record-gaps.ts` and read the diff.
 */

export const KNOWN_GAPS: Readonly<Record<string, number>> = {};
