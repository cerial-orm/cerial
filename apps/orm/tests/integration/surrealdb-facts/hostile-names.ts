/** Hostile identifiers and the quoting the facts pin, shared by the facts and the removal payload run. */

export const BS = String.fromCharCode(92);
export const BT = '`';
export const LF = String.fromCharCode(0x0a);
export const CR = String.fromCharCode(0x0d);
export const NEL = String.fromCharCode(0x85);
export const LS = String.fromCharCode(0x2028);
export const PS = String.fromCharCode(0x2029);
export const VT = String.fromCharCode(0x0b);
export const FF = String.fromCharCode(0x0c);

/** Terminators SurrealDB ends a `--` comment on, each with the escape that stands for it in a quoted name. */
export const TERMINATORS: readonly (readonly [string, string, string])[] = [
  ['LF', LF, `${BS}n`],
  ['CR', CR, `${BS}r`],
  ['NEL', NEL, `${BS}u{85}`],
  ['LS', LS, `${BS}u{2028}`],
  ['PS', PS, `${BS}u{2029}`],
];

const ESCAPES = new Map<string, string>([
  [BS, BS + BS],
  [BT, BS + BT],
  ...TERMINATORS.map(([, raw, escaped]) => [raw, escaped] as [string, string]),
]);

/** The quoting under test: backslash doubled, backtick backslashed, terminators as escapes. */
export function quote(name: string): string {
  let out = '';
  for (const char of name) out += ESCAPES.get(char) ?? char;

  return BT + out + BT;
}

/** A dotted path: each segment quoted, `*` left bare. */
export function quotePath(...segments: string[]): string {
  return segments.map((s) => (s === '*' ? s : quote(s))).join('.');
}

export const PAYLOAD = 'REMOVE TABLE victim;';

export interface NameCase {
  readonly label: string;
  readonly name: string;
}

export const NAME_CASES: readonly NameCase[] = [
  { label: 'semicolon', name: 'h; REMOVE TABLE victim; --' },
  { label: 'space', name: 'h REMOVE TABLE victim' },
  ...TERMINATORS.map(([label, raw]) => ({ label, name: `h${raw}${PAYLOAD}` })),
  { label: 'backtick', name: `h${BT}; REMOVE TABLE victim; --` },
  { label: 'trailing backslash', name: `h; REMOVE TABLE victim; --${BS}` },
  { label: 'backslash then backtick', name: `h${BS}${BT}; REMOVE TABLE victim; --` },
  { label: 'unicode', name: 'héllo😀; REMOVE TABLE victim; --' },
];
