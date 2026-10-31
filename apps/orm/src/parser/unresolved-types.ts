// Scoped to one synchronous parse, like the file of the parse in progress: field and tuple element parsers are
// called from helpers that carry no parser state, so the mode is not threaded through each call
let tolerating = false;

/** Run `fn` with a type name no declaration provides kept as a member instead of reported as an error */
export function withUnresolvedTypes<T>(fn: () => T): T {
  const previous = tolerating;
  tolerating = true;
  try {
    return fn();
  } finally {
    tolerating = previous;
  }
}

/** True inside {@link withUnresolvedTypes} */
export function toleratesUnresolvedTypes(): boolean {
  return tolerating;
}

/** A bare name, optionally an array: the only shape worth keeping, so a typo such as `Strin g` still fails */
export function isTypeName(token: string): boolean {
  return /^[A-Za-z_]\w*(\[\])?$/.test(token);
}
