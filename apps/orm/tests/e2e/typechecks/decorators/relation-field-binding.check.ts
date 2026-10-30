/**
 * Type checks for naming a relation's foreign key with `.field()`.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * The name `.field('x')` gives joins the model's member names, so pick, omit and composite lists accept it,
 * and a relation line offers none of the methods the validators refuse on a Relation.
 */

import { f, model } from '../../../../src/parser/builder';

const Author = model('Author', { id: f.record().id() });

// Positive: a renamed key is a member, so pick, omit and composite field lists take it.
const Comment = model(
  'Comment',
  {
    id: f.record().id(),
    approver: f
      .relation(() => Author)
      .field('approvedBy')
      .optional(),
    author: f.relation(() => Author),
  },
  { index: { name: 'byApprover', fields: ['approvedBy'] } },
);
export const picked = model('Picked', {}, { extends: Comment.pick('approvedBy', 'approver', 'authorId') });
export const omitted = model('Omitted', {}, { extends: Comment.omit('approvedBy') });

// Positive: a key the model declares itself is a member by its own entry.
export const declared = model(
  'Declared',
  { ownerId: f.record(), owner: f.relation(() => Author).field('ownerId') },
  { unique: { name: 'byOwner', fields: ['ownerId'] } },
);

// Negative: the default key of a relation renamed with .field() is not a member.
// @ts-expect-error 'approverId' is the default name, which .field('approvedBy') replaced
Comment.pick('approverId');
// @ts-expect-error a composite list names members only
model('Bad', { owner: f.relation(() => Author).field('ownerId') }, { index: { name: 'i', fields: ['ownerKey'] } });

// Negative: nothing the validators refuse on a Relation is on the chain.
// @ts-expect-error @nullable is refused on a Relation
f.relation(() => Author).nullable();
// @ts-expect-error @readonly is refused on a Relation
f.relation(() => Author).readonly();
const many = f.relation(() => Author).array();
// @ts-expect-error @distinct is refused on a Relation
many.distinct();
// @ts-expect-error @sort is refused on a Relation
many.sort();
