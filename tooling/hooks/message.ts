// The commit message gates: what a message may not say, and the shape it holds.

import { firstHit, type Pattern, TRACKER_PATTERNS } from './patterns.ts';
import { PACKAGE_FOR_SCOPE, packageVersion } from './repo-scans.ts';
import type { Refusal } from './scan.ts';

export const SUBJECT_MAX = 72;
// The repository's own history wraps bodies at up to 78 columns, so a limit of
// 72 would refuse the style it is meant to protect.
export const BODY_WRAP = 80;
export const MIN_SENTENCES = 2;

export const COMMIT_TYPES: readonly string[] = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'chore',
  'perf',
  'build',
  'ci',
  'style',
  'revert',
];

export const COMMIT_SCOPES: readonly string[] = ['orm', 'extension', 'docs', 'repo'];

/**
 * Types whose body is the point: a behaviour change or a fix is explained by why
 * it was made, which the diff cannot say. The other types may stand on the
 * subject alone. Ten of the last fifty commits had no body at all, all of them
 * docs, chore, test, style, build or ci, so a flat body minimum would refuse a
 * fifth of this repository's own history. Do not fold this back into one number.
 */
export const BODY_REQUIRED_TYPES: ReadonlySet<string> = new Set(['feat', 'fix', 'refactor', 'perf']);

const CONVENTIONAL = /^([a-z]+)(?:\(([^()\s]+)\))?(!)?: (.*)$/;
const RELEASE_DESCRIPTION = /^release v/;
const RELEASE_FORM = /^release v(\d+\.\d+\.\d+)$/;

/** A result rather than a change: what the checks said, not what the code does. */
const STATUS_CLAIMS: readonly Pattern[] = [
  {
    rule: 'message.status-green',
    gate: 'status claim',
    regex:
      /\b(?:scans?|checks?|tests?|lints?|suites?|builds?|everything|all)\s+(?:are\s+|is\s+|now\s+|all\s+)*green\b/i,
    hint: 'A message says what the change does. The checks speak for themselves.',
  },
  {
    rule: 'message.status-all-pass',
    gate: 'status claim',
    regex: /\ball\s+(?:the\s+)?(?:tests?|checks?|scans?|suites?|specs?)\s+(?:now\s+)?pass/i,
    hint: 'A message says what the change does. The checks speak for themselves.',
  },
  {
    rule: 'message.status-ratio',
    gate: 'status claim',
    regex: /\b\d+\s*\/\s*\d+\b/,
    hint: 'A ratio is a result of running the checks rather than a description of the change.',
  },
  {
    rule: 'message.status-count',
    gate: 'status claim',
    regex: /\b\d+\s+(?:tests?|checks?|suites?|specs?|cases?|assertions?)\s+(?:now\s+)?(?:pass|green|succeed)/i,
    hint: 'A count of passing tests belongs in the run, not in the history.',
  },
  {
    rule: 'message.status-measurement',
    gate: 'status claim',
    regex: /\b(?:coverage|pass\s*rate)\s+(?:is\s+|at\s+|of\s+)?\d/i,
    hint: 'A measurement belongs where it was measured.',
  },
  {
    rule: 'message.status-percentage',
    gate: 'status claim',
    regex: /\b\d+\s*(?:%|per\s?cent)\s+(?:coverage|passing|green)\b/i,
    hint: 'A measurement belongs where it was measured.',
  },
  {
    rule: 'message.status-no-failures',
    gate: 'status claim',
    regex: /\bno\s+(?:errors?|warnings?|failures?|regressions?|violations?|hits?)\b/i,
    hint: 'An absent failure is not a change. Say what the change does.',
  },
  {
    rule: 'message.status-zero-failures',
    gate: 'status claim',
    regex: /\b(?:zero|0)\s+(?:errors?|warnings?|failures?|hits?|violations?)\b/i,
    hint: 'An absent failure is not a change. Say what the change does.',
  },
  {
    rule: 'message.status-clean',
    gate: 'status claim',
    regex: /\b(?:lint|build|scan|suite|run)\s+is\s+clean\b/i,
    hint: 'A message says what the change does. The checks speak for themselves.',
  },
];

/** The work of looking, offered as the work that was done. */
const PROCESS_NOISE: readonly Pattern[] = [
  {
    rule: 'message.process-ran-a-check',
    gate: 'process noise',
    regex:
      /\b(?:ran|run|running|re-?ran)\s+(?:the\s+|a\s+)?(?:scan|sweep|clean-?up|lint(?:er)?|formatter|format|audit|pass)\b/i,
    hint: 'Running a check is not a change. Say what the change does to the code.',
  },
  {
    rule: 'message.process-a-named-pass',
    gate: 'process noise',
    regex: /\b(?:clean-?up|sweep|scan|lint|formatting|tidy(?:ing)?|housekeeping|review)\s+pass\b/i,
    hint: 'Name the change the pass produced rather than the pass.',
  },
  {
    rule: 'message.process-after-an-activity',
    gate: 'process noise',
    regex: /\bafter\s+(?:a|the)\s+(?:scan|sweep|clean-?up|refactor|review)\b/i,
    hint: 'Name the change rather than the activity that led to it.',
  },
  {
    rule: 'message.process-part-of-an-activity',
    gate: 'process noise',
    regex: /\bas\s+part\s+of\s+(?:a|the)\s+(?:clean-?up|sweep|scan|refactor|review)\b/i,
    hint: 'Name the change rather than the activity that led to it.',
  },
];

/** Reassurance about what did not happen, in place of what did. */
const DEFENSIVE_NARRATION: readonly Pattern[] = [
  {
    rule: 'message.defensive-no-behaviour-change',
    gate: 'defensive narration',
    regex: /\bno\s+(?:behaviou?r(?:al)?|functional|semantic|logic|runtime)\s+changes?\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-behaviour-unchanged',
    gate: 'defensive narration',
    regex: /\bbehaviou?r\s+(?:is\s+)?(?:un)?changed\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-changes-no-behaviour',
    gate: 'defensive narration',
    regex: /\bdoes\s+not\s+change\s+(?:any\s+)?behaviou?r\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-purely-cosmetic',
    gate: 'defensive narration',
    regex: /\b(?:purely|entirely|strictly|just|only)\s+(?:cosmetic|mechanical)\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-cosmetic-only',
    gate: 'defensive narration',
    regex: /\bcosmetic\s+only\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-one-kind-only',
    gate: 'defensive narration',
    regex: /\b(?:rename|renaming|formatting|whitespace|comment|doc|docs)s?\s+only\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-just-a-rename',
    gate: 'defensive narration',
    regex: /\b(?:just|only)\s+a\s+(?:rename|reformat|move|comment)\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-nothing-changed',
    gate: 'defensive narration',
    regex: /\bnothing\s+(?:else\s+)?(?:changed|changes|breaks?)\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-should-be-safe',
    gate: 'defensive narration',
    regex: /\bshould\s+be\s+(?:safe|a\s+no-?op|harmless)\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
  {
    rule: 'message.defensive-non-functional',
    gate: 'defensive narration',
    regex: /\bnon-?functional\s+changes?\b/i,
    hint: 'Describe the change. A reader who wants the diff has the diff.',
  },
];

/**
 * Who or what wrote the change, which the history does not record.
 *
 * The aim is to refuse attribution, not to ban words, so the patterns match the
 * shapes an attribution takes rather than every mention of a tool. The co-author
 * trailer is narrowed on purpose: a trailer naming a bot or a model is refused,
 * and one naming a person is not, because crediting a human collaborator is
 * ordinary git practice and the rule this enforces is about machine authorship.
 */
const AI_ATTRIBUTION: readonly Pattern[] = [
  {
    rule: 'message.attribution-vendor',
    gate: 'attribution',
    regex: /\b(?:claude|anthropic|chatgpt|openai|copilot|gemini|codeium)\b/i,
    hint: 'A commit message records what changed and why, and no more.',
  },
  {
    rule: 'message.attribution-generated-with',
    gate: 'attribution',
    regex: /\bgenerated\s+(?:with|by)\b/i,
    hint: 'A commit message records what changed and why, and no more.',
  },
  {
    rule: 'message.attribution-co-author-trailer',
    gate: 'attribution',
    regex:
      /^\s*co-authored-by:.*(?:\[bot\]|bot@|claude|anthropic|copilot|chatgpt|openai|gemini|\bai\b|assistant|agent|model)/im,
    hint: 'A commit message records what changed and why, and no more.',
  },
  {
    rule: 'message.attribution-session-trailer',
    gate: 'attribution',
    regex: /^\s*(?:[A-Za-z0-9-]+-)?(?:session|generated-by|assistant|agent|model|tool)(?:-[a-z]+)?\s*:\s*\S/im,
    hint: 'A trailer naming the session that produced the change is not history.',
  },
  {
    rule: 'message.attribution-asked-a-model',
    gate: 'attribution',
    regex: /\basked\s+(?:the\s+|an?\s+)?(?:model|assistant|agent|ai|bot)\b/i,
    hint: 'How the change was produced is not what the change does.',
  },
  {
    rule: 'message.attribution-written-by-a-model',
    gate: 'attribution',
    regex:
      /\b(?:written|authored|produced|created|drafted|implemented|suggested)\s+by\s+(?:an?\s+|the\s+)?(?:ai|model|assistant|agent|bot)\b/i,
    hint: 'How the change was produced is not what the change does.',
  },
  {
    rule: 'message.attribution-ai-generated',
    gate: 'attribution',
    regex: /\bAI[- ]generated\b/i,
    hint: 'How the change was produced is not what the change does.',
  },
  {
    rule: 'message.attribution-with-help-of-a-model',
    gate: 'attribution',
    regex: /\bwith\s+(?:the\s+)?help\s+of\s+(?:an?\s+)?(?:ai|model|assistant|agent)\b/i,
    hint: 'How the change was produced is not what the change does.',
  },
  {
    rule: 'message.attribution-prompted-a-model',
    gate: 'attribution',
    regex: /\bprompt(?:ed|ing)?\s+(?:the\s+|an?\s+)?(?:model|assistant|agent)\b/i,
    hint: 'How the change was produced is not what the change does.',
  },
];

/**
 * Every pattern a message is read against. The tracker shapes are the tree
 * scan's own pattern objects rather than a second list that happens to agree
 * with them, which is what makes widening the pattern source widen this gate in
 * the same edit.
 */
export const MESSAGE_GATES: readonly Pattern[] = [
  ...TRACKER_PATTERNS,
  ...STATUS_CLAIMS,
  ...PROCESS_NOISE,
  ...DEFENSIVE_NARRATION,
  ...AI_ATTRIBUTION,
];

/** Verbs whose imperative ends in the letters a past tense usually ends in. */
const ED_IMPERATIVES = new Set([
  'read',
  'lead',
  'feed',
  'seed',
  'speed',
  'need',
  'exceed',
  'proceed',
  'succeed',
  'shed',
  'spread',
  'embed',
  'breed',
  'bleed',
  'plead',
  'heed',
  'weed',
  'hold',
]);

const ING_IMPERATIVES = new Set(['bring', 'cling', 'ring', 'sing', 'spring', 'string', 'swing']);

const SCISSORS = /^#\s*-+\s*>8\s*-+/;
const TRAILER = /^[A-Za-z][A-Za-z0-9-]*:\s/;
const GENERATED_SUBJECT = /^(?:Merge|Revert)\b/;

export interface MessageParts {
  readonly lines: readonly string[];
  readonly subject: string;
  readonly bodyLines: readonly string[];
  readonly separatorIsBlank: boolean;
  /** Merges and reverts, whose text git writes, are held to no body minimum. */
  readonly generated: boolean;
}

/**
 * The message as git will store it: comment lines gone, the verbose diff gone,
 * leading and trailing blank lines gone.
 */
export function parseMessage(raw: string): MessageParts {
  const all = raw.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of all) {
    if (SCISSORS.test(line)) break;
    if (line.startsWith('#')) continue;
    kept.push(line);
  }
  while (kept.length > 0 && (kept[0] as string).trim() === '') kept.shift();
  while (kept.length > 0 && (kept[kept.length - 1] as string).trim() === '') kept.pop();

  const subject = kept[0] ?? '';
  const separatorIsBlank = kept.length < 2 || (kept[1] as string).trim() === '';
  const bodyLines = kept.slice(separatorIsBlank ? 2 : 1);
  return {
    lines: kept,
    subject,
    bodyLines,
    separatorIsBlank,
    generated: GENERATED_SUBJECT.test(subject),
  };
}

/** Terminated statements, which is as close to a sentence as a scanner gets. */
export function countSentences(text: string): number {
  const matches = text.match(/[.!?](?=\s|$)/g);
  return matches === null ? 0 : matches.length;
}

export interface Subject {
  readonly type: string;
  readonly scope: string | null;
  readonly description: string;
}

/** The subject split into its conventional prefix and what follows it, or null. */
export function parseSubject(subject: string): Subject | null {
  const found = CONVENTIONAL.exec(subject.trim());
  if (found === null) return null;

  return { type: found[1] as string, scope: found[2] ?? null, description: (found[4] as string).trim() };
}

/** The first word of the description, judged against the endings a verb form takes. */
export function looksImperative(subject: string): boolean {
  const word = (subject.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return false;
  if (word.endsWith('ing')) return ING_IMPERATIVES.has(word);
  if (word.endsWith('ed')) return ED_IMPERATIVES.has(word);
  if (word.endsWith('s')) return /(?:ss|us|is)$/.test(word);
  return true;
}

/**
 * The rules over the message's shape. They share one gate label, because that
 * is the word a person needs, and each names itself so a test can hold one
 * without matching the sentence it prints.
 */
export const SHAPE_RULES = {
  subjectMissing: 'shape.subject-missing',
  subjectTooLong: 'shape.subject-too-long',
  subjectTrailingPeriod: 'shape.subject-trailing-period',
  subjectNotImperative: 'shape.subject-not-imperative',
  subjectNotConventional: 'shape.subject-not-conventional',
  typeUnknown: 'shape.type-unknown',
  scopeUnknown: 'shape.scope-unknown',
  releaseForm: 'shape.release-form',
  releaseVersion: 'shape.release-version',
  bodyNotSeparated: 'shape.body-not-separated',
  bodyMissing: 'shape.body-missing',
  bodyTooFewSentences: 'shape.body-too-few-sentences',
  bodyLineTooLong: 'shape.body-line-too-long',
} as const;

const SHAPE = 'shape';

/** A refusal from one of the shape rules above. */
function refuse(rule: string, where: string, line: string, hint: string): Refusal {
  return { rule, gate: SHAPE, where, line: line.trim(), hint };
}

/** The version a scope's package declares in the index, which is what a release commit bumps. */
function stagedVersion(scope: string): string | null {
  const file = PACKAGE_FOR_SCOPE[scope];

  return file === undefined ? null : packageVersion(file, ':0');
}

/** A release subject must name a package and the version that package now declares. */
function checkRelease(parsed: Subject, subject: string, versionOf: (scope: string) => string | null): Refusal[] {
  const form = RELEASE_FORM.exec(parsed.description);
  if (parsed.type !== 'chore' || parsed.scope === null || !(parsed.scope in PACKAGE_FOR_SCOPE) || form === null) {
    return [
      refuse(
        SHAPE_RULES.releaseForm,
        'message:1',
        subject,
        'A release subject reads chore(orm): release v1.2.3, with orm or extension as the scope.',
      ),
    ];
  }
  const declared = versionOf(parsed.scope);
  if (declared === form[1]) return [];

  return [
    refuse(
      SHAPE_RULES.releaseVersion,
      'message:1',
      subject,
      `The subject says ${form[1]} and the ${parsed.scope} package.json says ${declared ?? 'nothing readable'}.`,
    ),
  ];
}

/** Every reason this message cannot be committed, in the order they appear. */
export function checkMessage(raw: string, versionOf: (scope: string) => string | null = stagedVersion): Refusal[] {
  const parts = parseMessage(raw);
  const refusals: Refusal[] = [];

  for (let index = 0; index < parts.lines.length; index += 1) {
    const line = parts.lines[index] as string;
    const hit = firstHit(line, MESSAGE_GATES);
    if (hit !== null) {
      refusals.push({
        rule: hit.pattern.rule,
        gate: hit.pattern.gate,
        where: `message:${index + 1}`,
        line: line.trim(),
        hint: hit.pattern.hint,
      });
    }
  }

  if (parts.subject.trim().length === 0) {
    refusals.push(refuse(SHAPE_RULES.subjectMissing, 'message:1', '', 'A commit message needs a subject.'));
    return refusals;
  }

  const subject = parts.subject.trim();
  if (subject.length > SUBJECT_MAX) {
    refusals.push(
      refuse(
        SHAPE_RULES.subjectTooLong,
        'message:1',
        subject,
        `The subject runs to ${subject.length} characters and the limit is ${SUBJECT_MAX}.`,
      ),
    );
  }
  if (subject.endsWith('.')) {
    refusals.push(
      refuse(SHAPE_RULES.subjectTrailingPeriod, 'message:1', subject, 'The subject carries no trailing period.'),
    );
  }

  if (parts.generated) return refusals;

  const parsed = parseSubject(subject);
  if (parsed === null) {
    refusals.push(
      refuse(
        SHAPE_RULES.subjectNotConventional,
        'message:1',
        subject,
        'The subject reads type(scope): description, as in feat(orm): add typed ids.',
      ),
    );
    return refusals;
  }

  if (!COMMIT_TYPES.includes(parsed.type)) {
    refusals.push(
      refuse(SHAPE_RULES.typeUnknown, 'message:1', subject, `The type is one of ${COMMIT_TYPES.join(', ')}.`),
    );
  }
  if (parsed.scope !== null && !COMMIT_SCOPES.includes(parsed.scope)) {
    refusals.push(
      refuse(
        SHAPE_RULES.scopeUnknown,
        'message:1',
        subject,
        `The scope is one of ${COMMIT_SCOPES.join(', ')}, or left out.`,
      ),
    );
  }
  if (!looksImperative(parsed.description)) {
    refusals.push(
      refuse(
        SHAPE_RULES.subjectNotImperative,
        'message:1',
        subject,
        'The description is in the imperative: write what the commit does, as an instruction.',
      ),
    );
  }
  if (RELEASE_DESCRIPTION.test(parsed.description)) {
    refusals.push(...checkRelease(parsed, subject, versionOf));
  }

  if (!parts.separatorIsBlank) {
    refusals.push(
      refuse(
        SHAPE_RULES.bodyNotSeparated,
        'message:2',
        parts.lines[1] as string,
        'A blank line separates the subject from the body.',
      ),
    );
  }

  const body = parts.bodyLines.join('\n').trim();
  if (body.length === 0 && !BODY_REQUIRED_TYPES.has(parsed.type)) return refusals;
  if (body.length === 0) {
    refusals.push(
      refuse(
        SHAPE_RULES.bodyMissing,
        'message:1',
        subject,
        `A ${parsed.type} commit needs a body. Write at least ${MIN_SENTENCES} sentences saying what changed and why.`,
      ),
    );
    return refusals;
  }

  const sentences = countSentences(body);
  if (BODY_REQUIRED_TYPES.has(parsed.type) && sentences < MIN_SENTENCES) {
    refusals.push(
      refuse(
        SHAPE_RULES.bodyTooFewSentences,
        'message:3',
        body.split('\n')[0] as string,
        `The body carries ${sentences} finished sentence${sentences === 1 ? '' : 's'} and wants at least ${MIN_SENTENCES}.`,
      ),
    );
  }

  const offset = parts.separatorIsBlank ? 3 : 2;
  for (let index = 0; index < parts.bodyLines.length; index += 1) {
    const line = parts.bodyLines[index] as string;
    if (line.length <= BODY_WRAP) continue;
    if (TRAILER.test(line)) continue;
    if (!/\s/.test(line.trim())) continue;
    refusals.push(
      refuse(
        SHAPE_RULES.bodyLineTooLong,
        `message:${index + offset}`,
        line,
        `The body wraps at ${BODY_WRAP} characters and this line runs to ${line.length}.`,
      ),
    );
  }

  return refusals;
}
