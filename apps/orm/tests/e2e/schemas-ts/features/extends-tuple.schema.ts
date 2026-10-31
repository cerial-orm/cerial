import { e, f, model, object, tuple } from '../../../../src/schema';

export const ExtBasePair = tuple('ExtBasePair', [e.string(), e.int()]);

export const ExtTriple = tuple('ExtTriple', [e.bool()], { extends: ExtBasePair });

export const ExtNamedPair = tuple('ExtNamedPair', { name: e.string(), age: e.int() });

export const ExtNamedTriple = tuple('ExtNamedTriple', { active: e.bool() }, { extends: ExtNamedPair });

export const ExtFirstTwo = tuple('ExtFirstTwo', [], { extends: ExtBasePair.pick(0, 1) });

export const ExtWithoutSecond = tuple('ExtWithoutSecond', [], { extends: ExtBasePair.omit(1) });

export const ExtOverridePair = tuple('ExtOverridePair', [e.string(), e.float()]);

export const ExtPrivatePair = tuple('ExtPrivatePair', [e.string().private(), e.int().private()]);

export const ExtOptionalTriple = tuple('ExtOptionalTriple', [
  e.string().nullable(),
  e.int().nullable(),
  e.bool().nullable(),
]);

export const ExtNullableTriple = tuple('ExtNullableTriple', [
  e.string().nullable(),
  e.int().nullable(),
  e.bool().nullable(),
]);

export const ExtDecoratedTriple = tuple('ExtDecoratedTriple', [
  e.string().default('test'),
  e.int().default(0),
  e.bool().default(false),
]);

export const ExtQuad = tuple('ExtQuad', [e.float()], { extends: ExtTriple });

export const ExtCoord = object('ExtCoord', {
  x: f.float(),
  y: f.float(),
});

export const ExtCoordPair = tuple('ExtCoordPair', [e.object(ExtCoord), e.object(ExtCoord)]);

export const ExtTupleModel = model('ExtTupleModel', {
  id: f.record().id(),
  pair: f.tuple(ExtBasePair),
  triple: f.tuple(ExtTriple),
  namedTriple: f.tuple(ExtNamedTriple),
  quad: f.tuple(ExtQuad),
  coordPair: f.tuple(ExtCoordPair),
  optionalTriple: f.tuple(ExtOptionalTriple).optional(),
});

export const ExtPickedName = tuple('ExtPickedName', {}, { extends: ExtNamedPair.pick('name') });

export const ExtOmittedAge = tuple('ExtOmittedAge', {}, { extends: ExtNamedPair.omit('age') });

export const ExtTupleByName = model('ExtTupleByName', {
  id: f.record().id(),
  picked: f.tuple(ExtPickedName),
  omitted: f.tuple(ExtOmittedAge),
});
