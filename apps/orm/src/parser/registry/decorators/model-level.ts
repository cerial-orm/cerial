import type { ASTCompositeDirective } from '../../../types';
import { parseCompositeDirective } from '../../types/model/composite-directive-parser';
import type { DecoratorEntry, DecoratorHandler } from '../types';

/**
 * The directive parser takes a whole line and a line number and reports a bad line as `error`. The
 * handler contract takes a token and a range and returns a node, so a bad line throws here instead.
 * The parser reports the thrown message as the line's error.
 */
const parseDirective: DecoratorHandler = (token, range): ASTCompositeDirective => {
  const { directive, error } = parseCompositeDirective(token, range.start.line);
  if (!directive) throw new Error(error ?? `Invalid composite directive: ${token}`);

  return directive;
};

export const modelLevelDecorators: readonly DecoratorEntry[] = [
  {
    name: '@@index',
    args: { kind: 'nameAndFields' },
    targets: ['model'],
    excludes: [],
    description: 'Creates a non-unique composite index over several fields: @@index(name, [a, b.c]).',
    parse: parseDirective,
  },
  {
    name: '@@unique',
    args: { kind: 'nameAndFields' },
    targets: ['model'],
    excludes: [],
    description: 'Creates a unique composite index over several fields: @@unique(name, [a, b.c]).',
    parse: parseDirective,
  },
];
