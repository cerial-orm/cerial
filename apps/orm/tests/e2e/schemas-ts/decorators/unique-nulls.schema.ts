import { f, model, object } from '../../../../src/schema';

export const NnProfile = object('NnProfile', {
  handle: f.string().optional().nullable().unique('nullsNotDistinct'),
});

export const NnUser = model('NnUser', {
  id: f.record().id(),
  email: f.email().unique(),
  nickname: f.string().optional().nullable().unique('nullsNotDistinct'),
  plainNick: f.string().optional().nullable().unique(),
  profile: f.object(NnProfile).optional(),
});

export const NnSlot = model(
  'NnSlot',
  {
    id: f.record().id(),
    tenantId: f.string().optional().nullable(),
    slug: f.string().optional().nullable(),
  },
  { unique: { name: 'tenantSlug', fields: ['tenantId', 'slug'], nullsNotDistinct: true } },
);

export const NnPlainSlot = model(
  'NnPlainSlot',
  {
    id: f.record().id(),
    tenantId: f.string().optional().nullable(),
    slug: f.string().optional().nullable(),
  },
  { unique: { name: 'plainSlot', fields: ['tenantId', 'slug'] } },
);
