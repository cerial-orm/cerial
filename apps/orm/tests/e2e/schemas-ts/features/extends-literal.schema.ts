import { f, literal, model, object, variant } from '../../../../src/schema';

export const ExtBasePriority = literal('ExtBasePriority', [
  variant.string('low'),
  variant.string('medium'),
  variant.string('high'),
]);

export const ExtExtendedPriority = literal(
  'ExtExtendedPriority',
  [variant.string('critical'), variant.string('urgent')],
  { extends: ExtBasePriority },
);

export const ExtHighPriority = literal('ExtHighPriority', [variant.string('critical')], { extends: ExtBasePriority });

export const ExtLowMediumPriority = literal('ExtLowMediumPriority', [variant.string('low'), variant.string('medium')]);

export const ExtBaseLevel = literal('ExtBaseLevel', [variant.int(1), variant.int(2), variant.int(3)]);

export const ExtExtendedLevel = literal('ExtExtendedLevel', [variant.int(4), variant.int(5)], {
  extends: ExtBaseLevel,
});

export const ExtBaseMixed = literal('ExtBaseMixed', [
  variant.string('active'),
  variant.string('inactive'),
  variant.bool(true),
  variant.bool(false),
]);

export const ExtExtendedMixed = literal('ExtExtendedMixed', [variant.string('pending'), variant.int(0)], {
  extends: ExtBaseMixed,
});

export const ExtBroadType = literal('ExtBroadType', [variant.broadType('String'), variant.broadType('Int')]);

export const ExtExtendedBroad = literal('ExtExtendedBroad', [variant.broadType('Bool')], { extends: ExtBroadType });

export const ExtStringOnly = literal('ExtStringOnly', [], { extends: ExtBaseMixed.pick('true', 'false') });

export const ExtNonBoolMixed = literal('ExtNonBoolMixed', [], { extends: ExtBaseMixed.omit('true', 'false') });

export const ExtLiteralModel = model('ExtLiteralModel', {
  id: f.record().id(),
  priority: f.literal(ExtExtendedPriority),
  level: f.literal(ExtExtendedLevel),
  status: f.literal(ExtExtendedMixed),
  broadValue: f.literal(ExtExtendedBroad),
  highPriority: f.literal(ExtHighPriority).optional(),
  priorities: f.literal(ExtExtendedPriority).array(),
});

export const ExtLiteralInfo = object('ExtLiteralInfo', {
  priority: f.literal(ExtExtendedPriority),
  level: f.literal(ExtExtendedLevel),
  status: f.literal(ExtExtendedMixed).optional(),
});

export const ExtLiteralContainer = model('ExtLiteralContainer', {
  id: f.record().id(),
  name: f.string(),
  details: f.object(ExtLiteralInfo),
  detailsList: f.object(ExtLiteralInfo).array(),
});

export const ExtQuotedPick = literal('ExtQuotedPick', [], { extends: ExtBasePriority.pick("'low'", "'high'") });

export const ExtQuotedOmit = literal('ExtQuotedOmit', [], { extends: ExtBasePriority.omit("'medium'") });

export const ExtLiteralQuoted = model('ExtLiteralQuoted', {
  id: f.record().id(),
  picked: f.literal(ExtQuotedPick),
  omitted: f.literal(ExtQuotedOmit),
});
