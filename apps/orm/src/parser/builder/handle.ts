/**
 * What a builder returns: the definition's name, plus the ID type of a model so a reference to it can type
 * relations against it. `idType` and `memberNames` are phantoms, never present at runtime.
 */
export interface Handle<Name extends string = string, Id = never, Members extends string = string> {
  readonly name: Name;
  readonly idType?: Id;
  /** The names the declaration declares, for checking a pick or omit list. Never present at runtime. */
  readonly memberNames?: Members;
}

/** A reference in a field position: a handle by value, a thunk returning one, or a bare name */
export type Reference<Name extends string = string> = Handle<Name, unknown> | (() => Handle<Name, unknown>) | Name;

/**
 * Reduce a reference to the name it stands for. A thunk is called here and nowhere earlier, so a
 * reference to a `const` declared further down the module is safe until materialise time.
 */
export function referenceName(reference: Reference): string {
  if (typeof reference === 'string') return reference;
  if (typeof reference === 'function') return reference().name;

  return reference.name;
}
