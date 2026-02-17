import type { CerialId } from './cerial-id';
import type { CerialUuid } from './cerial-uuid';
import type { CerialDuration } from './cerial-duration';
import type { CerialDecimal } from './cerial-decimal';
import type { CerialBytes } from './cerial-bytes';
import type { CerialGeometry } from './cerial-geometry';

/** Recursive union type for Any fields — covers all SurrealDB value types */
export type CerialAny =
  | string
  | number
  | boolean
  | Date
  | CerialId
  | CerialUuid
  | CerialDuration
  | CerialDecimal
  | CerialBytes
  | CerialGeometry
  | null
  | CerialAny[]
  | { [key: string]: CerialAny };
