// The one pattern source. The staged-tree scans and the message gate both read
// this file, so widening a pattern widens both and the two cannot drift apart.
//
// Every marker literal is written with one character held in a class, as in
// `T[O]DO`. The compiled regex still matches the marker; the source text you
// are reading does not contain it. That is deliberate: the scans read this file
// along with everything else that is committed, so a marker spelled plainly
// would match itself and refuse every commit.

/**
 * What a refusal says about itself, apart from where it was found.
 *
 * The gate is the label a person reads and it groups rules: every shape rule in
 * the message gate carries the one word `shape`. The rule is the identifier a
 * test names, and it is unique. Both are needed, because a label that told the
 * rules apart would be a label nobody could group by, and a test asserting on
 * the hint is a test that breaks when somebody improves a sentence.
 */
export interface Rule {
  /** A stable identifier for the rule, unique across every gate. */
  readonly rule: string;
  /** The gate this rule belongs to, used as the label in a refusal. */
  readonly gate: string;
  /** What to do about a hit, shown under the offending line. */
  readonly hint: string;
}

export interface Pattern extends Rule {
  /** The shape being refused. */
  readonly regex: RegExp;
}

/**
 * Planning identifiers. Committed code, comments, tests, scripts, hooks and
 * public documentation say what the code does, never which planning item it
 * came from, so these shapes are refused everywhere outside the planning tree.
 *
 * Error codes are deliberately not matched. A code of the form
 * `E-MNEMONIC-#####` describes a failure the code can raise, so it survives
 * every pattern here: the lettered identifier shapes exempt a code's own
 * leading segment and nothing else, and the numeric shapes want two digits, a
 * hyphen and three digits, which a code's five-digit tail does not offer.
 *
 * The exemption is written as two lookbehinds rather than one because a single
 * one cannot say both things. Refusing an identifier that a word and a hyphen
 * sit in front of is the point of the scan, so the boundary is any letter or
 * digit; the code prefix is then named on its own, and it is the only prefix
 * the scan lets past.
 */
/**
 * A decision (D) or finding (F) id used as a reference: parenthesised, in a
 * list, before a colon, or next to a word that makes it a reference. A bare
 * id stays legal, because `'D1'` is test data, `F16`, `F32` and `F64` are SDK classes
 * and `F2` or `Shift+F12` are keys. The lookbehind skips an id glued to a word,
 * a hyphen (an error code), a plus (a key chord), a slash or a quote; the
 * lookahead skips a call, a quote and a longer word.
 */
const ID = String.raw`(?:D|F(?!(?:16|32|64)\b))\d{1,3}`;
const START = String.raw`(?<![\w+/'"\x60-])`;
const END = String.raw`(?![\w'"\x60(])`;
const LEAD = String.raw`(?:enforces?|enforced|per|under|see|finding|decision|fix(?:es)?)`;
const TRAIL = String.raw`(?:moved|shape|payload|finding|decision|fix|rule|case|supersedes|superseded)`;
const DECISION_ID = new RegExp(
  [
    // Parenthesised, alone or listed; F2 and F12 alone in parentheses name keys.
    String.raw`\((?!F(?:2|12)\))${ID}(?:,\s*${ID})*\)`,
    // A comma list, with an optional `and` before the last.
    String.raw`${START}${ID}(?:,\s*(?:and\s+)?${ID})+${END}`,
    // Before a colon.
    String.raw`${START}${ID}:(?=\s|$)`,
    // After a word that cites it.
    String.raw`\b${LEAD}\s+${ID}${END}`,
    // Before a word that makes it a name for a decision or a finding.
    String.raw`${START}${ID}\s+${TRAIL}\b`,
  ].join('|'),
);

export const TRACKER_PATTERNS: readonly Pattern[] = [
  {
    rule: 'tracker.decision-record',
    gate: 'planning identifier',
    regex: /(?<!E-)(?<![A-Za-z0-9])ADR[ _-]?\d{3,4}\b/i,
    hint: 'Say what the code does. A decision record is read in the planning tree.',
  },
  {
    rule: 'tracker.specification',
    gate: 'planning identifier',
    regex: /(?<!E-)(?<![A-Za-z0-9])SR[ _-]?\d{3,4}\b/i,
    hint: 'Say what the code does. A specification id belongs in the planning tree.',
  },
  {
    rule: 'tracker.plan-item',
    gate: 'planning identifier',
    regex: /\b(?:slice|band|spike)s?\s*[#:-]?\s*\d/i,
    hint: 'Name the behaviour rather than the plan item that asked for it.',
  },
  {
    rule: 'tracker.task-row',
    gate: 'planning identifier',
    regex: /\btasks?\s*(?:row\s*)?[#:-]?\s*\d{2}\b/i,
    hint: 'Name the behaviour rather than the plan row that asked for it.',
  },
  {
    rule: 'tracker.ledger-id',
    gate: 'planning identifier',
    regex: /(?<![\dA-Za-z.-])\d{2}-\d{3}(?![\dA-Za-z-])/,
    hint: 'A capability ledger id. Name the capability instead.',
  },
  {
    rule: 'tracker.task-number',
    gate: 'planning identifier',
    regex: /\btasks?(?:\s+|\s*[#:-]\s*)\d\b(?![.,]\d)/i,
    hint: 'Name the behaviour rather than the plan row that asked for it.',
  },
  {
    // Zero-padded dotted ids. The second part of a three-part id (or the third)
    // must lead with a zero, which separates an id from a release such as a
    // runtime version; a two-part id must be zero-padded in both parts, which
    // separates it from a decimal. Neighbours that make it part of something
    // larger (a longer dotted run, a word, a hyphen, a slash) are not an id.
    rule: 'tracker.dotted-id',
    gate: 'planning identifier',
    regex: /(?<![\w.:/$#-])(?:\d{2}\.(?:0\d\.\d{2}|\d{2}\.0\d)|0\d\.0\d)(?![\w-]|\.\d)/,
    hint: 'A planning task id. Name the behaviour instead.',
  },
  {
    rule: 'tracker.decision-id',
    gate: 'planning identifier',
    regex: DECISION_ID,
    hint: 'A planning decision or finding id. State the decision or the behaviour instead.',
  },
  {
    rule: 'tracker.feature-id',
    gate: 'planning identifier',
    regex: /\(C\d{1,2}\)/,
    hint: 'A planning feature id. Name the feature instead.',
  },
  {
    rule: 'tracker.agent-lane',
    gate: 'planning identifier',
    regex: /(?<![\w-])(?:[Ll]ane[-_][a-z0-9]{2,}|waves?\s*[#:-]?\s*\d)/,
    hint: 'An agent lane or wave name. Say what the change does.',
  },
  {
    rule: 'tracker.section-reference',
    gate: 'planning cross-reference',
    regex: /\u00A7/,
    hint: 'A section reference points into the planning tree and goes stale there.',
  },
  {
    rule: 'tracker.planning-path',
    gate: 'planning path',
    regex: /\.o[m]c(?:[/\\]|\b)/i,
    hint: 'The planning tree is not shipped, so a path into it resolves to nothing.',
  },
];

/**
 * The planning tree, matched rather than spelled, for the reason at the top of
 * this file: a literal here would be a planning path in a committed file.
 */
export const PLANNING_PATH = /^\.o[m]c(?:[/\\]|$)/i;

/**
 * Files allowed to name the planning tree, because their whole job is to keep
 * it out. A tool cannot exclude a directory without writing the directory's
 * name down, so this file is exempt from the planning-path pattern and from
 * nothing else.
 */
export const TRACKER_EXEMPT_PATHS: readonly string[] = ['.gitignore'];

/**
 * Markers that admit the code is unfinished. Refused in production paths; test
 * trees are out of scope, because a test naming a marker is describing one.
 *
 * The upper-case marker for a stand-in value is matched in that case alone,
 * so a rendered input's `placeholder` attribute is left where it is.
 *
 * No rule here is named for the marker it refuses, for the reason at the top of
 * this file: a name is a plain string and cannot hold a character in a class,
 * so a rule called after its own marker would refuse the file that declares it.
 * Each is named for what a person was admitting instead, which is what the
 * refusal is about anyway.
 */
export const STUB_PATTERNS: readonly Pattern[] = [
  {
    rule: 'stub.come-back-to-it',
    gate: 'stub marker',
    regex: /\bt[o]do\b/i,
    hint: 'Finish it, drop it, or leave a tombstone carrying the reason.',
  },
  {
    rule: 'stub.fix-it-later',
    gate: 'stub marker',
    regex: /\bfix[m]e\b/i,
    hint: 'Fix it, or record the defect where defects are recorded.',
  },
  {
    rule: 'stub.bare-alarm',
    gate: 'stub marker',
    regex: /\bX[X]X\b/,
    hint: 'Say what is wrong in a sentence, or leave a tombstone.',
  },
  {
    rule: 'stub.admitted-workaround',
    gate: 'stub marker',
    regex: /\bh[a]ck\b/i,
    hint: 'Describe why the code is shaped this way, or leave a tombstone.',
  },
  {
    rule: 'stub.unfinished-marker',
    gate: 'stub marker',
    regex: /\bunimpl[e]mented\b/i,
    hint: 'Implement it, or leave a tombstone saying why it is absent.',
  },
  {
    rule: 'stub.unfinished-phrase',
    gate: 'stub marker',
    regex: /\bnot[\s_-]?implemented\b/i,
    hint: 'Implement it, or leave a tombstone saying why it is absent.',
  },
  {
    rule: 'stub.partial-work',
    gate: 'stub marker',
    regex: /\bW[I]P\b/,
    hint: 'Commit finished work, or say in the body what is deliberately partial.',
  },
  {
    rule: 'stub.stand-in-value',
    gate: 'stub marker',
    regex: /\bPLACEH[O]LDER\b/,
    hint: 'Ship the real thing, or leave a tombstone saying why it is absent.',
  },
];

/**
 * The tombstone: the one sanctioned way to record that something is
 * deliberately absent.
 *
 *     // TOMBSTONE: the remote engine has no move verb, so a move here would
 *     // be a copy and a delete under a name that promises neither.
 *
 * The marker, a colon, then a reason of at least {@link TOMBSTONE_MIN_REASON}
 * characters on the same line. A line carrying a well-formed tombstone is
 * exempt from every stub marker, so the reason may say the word the scan would
 * otherwise refuse. A bare marker with no reason is itself refused, which is
 * what stops the tombstone becoming a way to spell the marker it replaces.
 */
export const TOMBSTONE_MARKER = /\bT[O]MBSTONE\b/;
export const TOMBSTONE_FORM = /\bT[O]MBSTONE:[ \t]*(\S.*?)\s*$/;
export const TOMBSTONE_MIN_REASON = 20;

/** True when the line carries a tombstone whose reason is long enough to be one. */
export function hasTombstone(line: string): boolean {
  const found = TOMBSTONE_FORM.exec(line);
  return found !== null && (found[1] ?? '').length >= TOMBSTONE_MIN_REASON;
}

/** The first pattern that hits the line, with the text it matched. */
export function firstHit(line: string, patterns: readonly Pattern[]): { pattern: Pattern; text: string } | null {
  for (const pattern of patterns) {
    const found = pattern.regex.exec(line);
    if (found !== null) return { pattern, text: found[0] };
  }
  return null;
}

/**
 * Rules this repository wrote down and did not enforce. Their text is held to
 * the same standard as the markers above: a literal that would match itself is
 * spelled with a character in a class.
 */

/** A cast to `any`, spelled as one word so prose such as "has any" is left alone. */
export const AS_ANY: Pattern = {
  rule: 'ratchet.as-any',
  gate: 'cast to any',
  regex: /\bas\s+any\b/,
  hint: 'Narrow to the real type. A negative test may follow a type-error expectation that carries a reason.',
};

/** The sanctioned exemption: an expectation with an explanation, on the preceding line. */
export const SANCTIONED_TYPE_ERROR = /@ts-expect-error\b[:\s-]*\S.{9,}/;

/** Any lint-suppression directive, with or without its scope suffix. */
export const SUPPRESSION_DIRECTIVE = /oxlin[t]-disable(?:-next-line|-line)?(?!-\w)\b/;

/** A reason written after the directive on the same line, the form a next-line directive can carry. */
export const SUPPRESSION_INLINE_REASON = /\s--\s+\S.{3,}/;

/** A reason written as a comment on the line after the directive. */
export const SUPPRESSION_NEXT_LINE_REASON = /^\s*(?:\/\/|\*)\s*(?!oxlin[t]-)\S.{3,}/;

/** A suppression that names no rule. The reason is checked separately, because it may sit on the next line. */
export const SUPPRESSION: Pattern = {
  rule: 'suppression.bare',
  gate: 'unexplained suppression',
  // `(?!-\w)` stops the optional suffix being skipped by backtracking, which would test the rule against `-all ...`.
  regex: /oxlin[t]-disable(?:-next-line|-line)?(?!-\w)\b(?!\s+[\w/-]+)/,
  hint: 'Name the rule, and give the reason the code is shaped this way on the next line or after ` -- `.',
};

/**
 * Schema setup inside an end-to-end file. The preload does this once for the
 * whole run, and doing it per file is the race the project already documented.
 */
export const E2E_SETUP_PATTERNS: readonly Pattern[] = [
  {
    rule: 'e2e-setup.remove-table',
    gate: 'e2e schema setup',
    regex: /\bREMOVE\s+TABLE\b/i,
    hint: 'The preload removes tables once. A test file only deletes rows.',
  },
  {
    rule: 'e2e-setup.reset-migration-state',
    gate: 'e2e schema setup',
    regex: /\bresetMigrationState\s*\(/,
    hint: 'The preload resets migration state once. A test file only deletes rows.',
  },
  {
    rule: 'e2e-setup.migrate',
    gate: 'e2e schema setup',
    regex: /\bclient\.migrate\s*\(/,
    hint: 'The preload migrates once. A test file only deletes rows.',
  },
];
