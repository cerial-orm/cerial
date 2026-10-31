import { f, model } from '../../../../src/schema';

export const ExtL1Base = model(
  'ExtL1Base',
  {
    id: f.record().id().private(),
    createdAt: f.date().createdAt().private(),
  },
  { abstract: true },
);

export const ExtL2Mid = model(
  'ExtL2Mid',
  {
    name: f.string(),
    description: f.string().optional(),
  },
  { abstract: true, extends: ExtL1Base },
);

export const ExtL3High = model(
  'ExtL3High',
  {
    tags: f.string().array(),
    metadata: f.int().optional(),
  },
  { abstract: true, extends: ExtL2Mid },
);

export const ExtL4Base = model(
  'ExtL4Base',
  {
    status: f.string().default('active'),
    priority: f.int().default(0),
  },
  { abstract: true, extends: ExtL3High },
);

export const ExtL4Concrete = model('ExtL4Concrete', {}, { extends: ExtL4Base });

export const ExtL3Alt = model(
  'ExtL3Alt',
  {
    owner: f.record(),
    isPublic: f.bool().default(false),
  },
  { abstract: true, extends: ExtL2Mid },
);

export const ExtL4AltConcrete = model(
  'ExtL4AltConcrete',
  {
    viewCount: f.int().default(0),
    lastViewed: f.date().optional(),
  },
  { extends: ExtL3Alt },
);

export const ExtL3Pick = model('ExtL3Pick', { category: f.string() }, { abstract: true, extends: ExtL2Mid });

export const ExtL4PickConcrete = model(
  'ExtL4PickConcrete',
  {
    subcategory: f.string().optional(),
    rank: f.int().optional(),
  },
  { extends: ExtL3Pick },
);

export const ExtL3Omit = model(
  'ExtL3Omit',
  { kind: f.string() },
  { abstract: true, extends: ExtL2Mid.omit('description') },
);

export const ExtL4OmitConcrete = model(
  'ExtL4OmitConcrete',
  {
    subtype: f.string().optional(),
    version: f.int().default(1),
  },
  { extends: ExtL3Omit },
);

export const ExtL5Base = model(
  'ExtL5Base',
  { archived: f.bool().default(false) },
  { abstract: true, extends: ExtL4Base },
);

export const ExtL5VeryDeep = model('ExtL5VeryDeep', {}, { extends: ExtL5Base });

export const ExtL6UltraDeep = model(
  'ExtL6UltraDeep',
  {
    archiveReason: f.string().optional(),
    archivedAt: f.date().optional(),
  },
  { extends: ExtL5Base },
);

export const ExtP1 = model(
  'ExtP1',
  {
    id: f.record().id().private(),
    secret: f.string().private(),
    name: f.string(),
    note: f.string().optional(),
    tag: f.string(),
  },
  { abstract: true },
);

export const ExtP2 = model(
  'ExtP2',
  {
    extra: f.string().optional(),
    spare: f.string().optional(),
  },
  { abstract: true, extends: ExtP1.pick('id', 'secret', 'name', 'tag') },
);

export const ExtP3 = model('ExtP3', { level: f.int().default(1) }, { abstract: true, extends: ExtP2.omit('spare') });

export const ExtP4Concrete = model('ExtP4Concrete', { final: f.string().optional() }, { extends: ExtP3 });
