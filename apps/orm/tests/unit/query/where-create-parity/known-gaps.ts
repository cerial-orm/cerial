/**
 * What the where operand path still gets wrong against create, as the oracle measures it today.
 *
 * A key is `<kind of disagreement>|<slot>|<operand>` and its value is how many (path, operator) places
 * disagree. The oracle test compares the measured counts with this list both ways: a new disagreement or a
 * larger count is a regression, and a gap that is fixed fails the test until its entry is removed here.
 * Regenerate with `bun tests/unit/query/where-create-parity/record-gaps.ts` and read the diff.
 */

export const KNOWN_GAPS: Readonly<Record<string, number>> = {
  'where-refuses-accepted|deepT[1].t[0]|-1': 38,
  'where-refuses-accepted|deepT[1].t[0]|0': 38,
  'where-refuses-accepted|deepT[1].t[0]|1': 38,
  'where-refuses-accepted|deepT[1].t[0]|100000000000000000000': 38,
  'where-refuses-accepted|deepT[1].t[0]|9007199254740992': 38,
  'where-refuses-accepted|deepT[1].t[1]|""': 38,
  'where-refuses-accepted|deepT[1].t[1]|"1.5h"': 38,
  'where-refuses-accepted|deepT[1].t[1]|"1h"': 38,
  'where-refuses-accepted|deepT[1].t[1]|"1h0m"': 38,
  'where-refuses-accepted|deepT[1].t[1]|"1h1h"': 38,
  'where-refuses-accepted|deepT[1].t[1]|"4h60m"': 38,
  'where-refuses-accepted|deepT[1].t[1]|"60m"': 38,
  'where-refuses-accepted|deepT[1].t[1]|CerialDuration(1h)': 38,
  'where-refuses-accepted|deepT[1].t[1]|Duration(1h)': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|" 2021-01-01"': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|"2021"': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|"2021-01-01"': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|"2021-01-01T00:00:00+05:00"': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|"2021-01-01T00:00:00.000Z"': 38,
  'where-refuses-accepted|selfRef.child.child.fDate|Date(1970-01-01T00:00:00.000Z)': 38,
  'where-refuses-accepted|selfRef.child.child.fInt|-1': 38,
  'where-refuses-accepted|selfRef.child.child.fInt|0': 38,
  'where-refuses-accepted|selfRef.child.child.fInt|1': 38,
  'where-refuses-accepted|selfRef.child.child.fInt|100000000000000000000': 38,
  'where-refuses-accepted|selfRef.child.child.fInt|9007199254740992': 38,
  'where-refuses-accepted|selfRef.child.fDate|" 2021-01-01"': 38,
  'where-refuses-accepted|selfRef.child.fDate|"2021"': 38,
  'where-refuses-accepted|selfRef.child.fDate|"2021-01-01"': 38,
  'where-refuses-accepted|selfRef.child.fDate|"2021-01-01T00:00:00+05:00"': 38,
  'where-refuses-accepted|selfRef.child.fDate|"2021-01-01T00:00:00.000Z"': 38,
  'where-refuses-accepted|selfRef.child.fDate|Date(1970-01-01T00:00:00.000Z)': 38,
  'where-refuses-accepted|selfRef.child.fInt|-1': 38,
  'where-refuses-accepted|selfRef.child.fInt|0': 38,
  'where-refuses-accepted|selfRef.child.fInt|1': 38,
  'where-refuses-accepted|selfRef.child.fInt|100000000000000000000': 38,
  'where-refuses-accepted|selfRef.child.fInt|9007199254740992': 38,
};
