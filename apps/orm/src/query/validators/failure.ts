import { CerialUnknownFieldError, CerialValidationError } from '../../errors';

/** What every validator reports: where the problem is, what it is, and whether it was a name the model lacks. */
export interface ValidationProblem {
  readonly message: string;
  readonly path?: string;
  readonly field?: string;
  /** Set by the validators on a field name the model does not have, so the thrown error can be told apart by class. */
  readonly kind?: 'unknownField';
}

/**
 * The error to throw for a failed validation pass. `label` names the part of the call that was
 * rejected (`where clause`, `data`, `select`), so the message says which input to fix. An unknown
 * field name raises its own class because a caller handles a typo differently from a bad value.
 */
export function validationFailure(
  label: string,
  problems: readonly ValidationProblem[],
  model: { readonly name: string },
  operation?: string,
): CerialValidationError | CerialUnknownFieldError {
  const message = `Invalid ${label}: ${problems.map((p) => p.message).join(', ')}`;
  const unknown = problems.find((p) => p.kind === 'unknownField');
  const first = unknown ?? problems[0];
  // The where validator roots its paths at `where`, which is the argument, not part of the field name.
  const field = (first?.path ?? first?.field)?.replace(/^where\./, '');
  const options = { model: model.name, operation, field };

  return unknown ? new CerialUnknownFieldError(message, options) : new CerialValidationError(message, options);
}
