import { f, relationNodes } from '../../../parser/builder';
import type { ASTField } from '../../../types';
import { derivedKeyComment } from '../lossy-cases';
import { differences, withoutPosition } from '../compare';

type Step = (arg?: unknown) => Step;

function decoratorValue(field: ASTField, type: string): unknown {
  return field.decorators.find((decorator) => decorator.type === type)?.value;
}

/** Whether the field is the forward side of a relation: it names a foreign key and a target. */
export function isForwardRelation(field: ASTField): boolean {
  return (
    field.type === 'relation' &&
    typeof decoratorValue(field, 'field') === 'string' &&
    typeof decoratorValue(field, 'model') === 'string'
  );
}

/**
 * Whether the builder, given only the relation, would produce exactly `key` as its foreign key. The test
 * is the builder's own `relationNodes`, so it cannot drift from what a derived key really is.
 */
function derivesKey(relation: ASTField, key: ASTField | undefined): boolean {
  if (!key || decoratorValue(relation, 'field') !== key.name) return false;
  try {
    let builder = (f as unknown as Record<string, Step>).relation!(decoratorValue(relation, 'model'));
    if (relation.isOptional) builder = (builder as unknown as Record<string, Step>).optional!();
    if (relation.isArray) builder = (builder as unknown as Record<string, Step>).array!();
    const onDelete = decoratorValue(relation, 'onDelete');
    if (onDelete !== undefined) builder = (builder as unknown as Record<string, Step>).onDelete!(onDelete);
    const [derived] = relationNodes(builder, relation.name);

    return !differences(withoutPosition(derived), withoutPosition(key)).length;
  } catch {
    // A shape the builder refuses cannot be derived; the declared form states it instead
    return false;
  }
}

/** Whether the comment lines include the exact marker for the relation; an ordinary comment never matches. */
export function isMarked(lines: readonly string[] | undefined, relationName: string): boolean {
  return !!lines?.includes(derivedKeyComment(relationName));
}

export interface RelationPlan {
  /** Indexes of forward relations written without `.field(...)`, because the key before them is derived. */
  readonly derived: ReadonlySet<number>;
  /** Indexes of the foreign keys those relations derive, which are not written out. */
  readonly consumed: ReadonlySet<number>;
}

/**
 * Decide, per forward relation, between the derived form and a declared key bound with `.field(name)`.
 * The derived form is used only when the field directly before the relation carries convert's own
 * derived comment (`keyComments` holds the comment lines per field name) and is exactly the key the
 * builder would derive; any other key stays a declared field and the relation binds to it.
 */
export function planRelations(
  fields: readonly ASTField[],
  keyComments?: ReadonlyMap<string, readonly string[]>,
): RelationPlan {
  const derived = new Set<number>();
  const consumed = new Set<number>();
  fields.forEach((field, index) => {
    const key = fields[index - 1];
    if (!isForwardRelation(field) || !key || !isMarked(keyComments?.get(key.name), field.name)) return;
    if (!derivesKey(field, key)) return;
    derived.add(index);
    consumed.add(index - 1);
  });

  return { derived, consumed };
}
