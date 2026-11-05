import { CerialGenerationError } from '../../errors';
import { generatedNameProblem } from '../../utils/generated-name';

/**
 * Refuse a name the schema text cannot spell. A name from TypeScript skips the lexer, so `model('a b')`
 * would print as `model a b {` and read back as a model called `a`.
 */
export function checkedIdentifier(kind: string, name: unknown): string {
  const problem = generatedNameProblem(name, kind);
  if (problem === undefined) return name as string;
  throw new CerialGenerationError(`Invalid ${kind} name ${JSON.stringify(name)}: ${problem}`);
}

/** Refuse every key of a field body that is not an identifier. */
export function checkedKeys(kind: string, body: object): void {
  for (const key of Object.keys(body)) checkedIdentifier(kind, key);
}
