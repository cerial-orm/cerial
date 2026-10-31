import { enum as enumeration, f, model, object } from '../../../../src/schema';

export const ExtBaseRole = enumeration('ExtBaseRole', ['ADMIN', 'USER', 'MODERATOR']);

export const ExtExtendedRole = enumeration('ExtExtendedRole', ['SUPERADMIN', 'GUEST'], { extends: ExtBaseRole });

export const ExtCoreRole = enumeration('ExtCoreRole', [], { extends: ExtBaseRole.pick('ADMIN', 'USER') });

export const ExtNonAdminRole = enumeration('ExtNonAdminRole', [], { extends: ExtBaseRole.omit('ADMIN') });

export const ExtCustomRole = enumeration('ExtCustomRole', ['ADMIN', 'USER', 'MODERATOR', 'CUSTOM'], {
  extends: ExtBaseRole,
});

export const ExtBaseStatus = enumeration('ExtBaseStatus', ['ACTIVE', 'INACTIVE', 'PENDING']);

export const ExtDetailedStatus = enumeration('ExtDetailedStatus', ['ARCHIVED', 'DELETED', 'SUSPENDED'], {
  extends: ExtBaseStatus,
});

export const ExtSimpleStatus = enumeration('ExtSimpleStatus', [], {
  extends: ExtBaseStatus.pick('ACTIVE', 'INACTIVE'),
});

export const ExtEnumModel = model('ExtEnumModel', {
  id: f.record().id(),
  role: f.enum(ExtExtendedRole),
  status: f.enum(ExtDetailedStatus),
  coreRole: f.enum(ExtCoreRole).optional(),
  nonAdminRole: f.enum(ExtNonAdminRole).optional(),
  roles: f.enum(ExtExtendedRole).array(),
  statuses: f.enum(ExtDetailedStatus).array(),
});

export const ExtEnumInfo = object('ExtEnumInfo', {
  role: f.enum(ExtExtendedRole),
  status: f.enum(ExtDetailedStatus),
  backupRole: f.enum(ExtCoreRole).optional(),
});

export const ExtEnumContainer = model('ExtEnumContainer', {
  id: f.record().id(),
  name: f.string(),
  details: f.object(ExtEnumInfo),
  detailsList: f.object(ExtEnumInfo).array(),
});
