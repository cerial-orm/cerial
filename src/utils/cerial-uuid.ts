import { Uuid } from 'surrealdb';

export type CerialUuidInput = CerialUuid | Uuid | string;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is Uuid {
  return value instanceof Uuid;
}

export class CerialUuid {
  public readonly value: string;

  constructor(input: CerialUuidInput) {
    if (input instanceof CerialUuid) {
      this.value = input.value;
    } else if (isUuid(input)) {
      this.value = input.toString();
    } else if (typeof input === 'string') {
      if (!UUID_REGEX.test(input)) {
        throw new Error(`Invalid UUID string: ${input}`);
      }
      this.value = input.toLowerCase();
    } else {
      throw new Error(`Invalid input type for CerialUuid: ${typeof input}`);
    }
  }

  static is(value: unknown): value is CerialUuid {
    return value instanceof CerialUuid;
  }

  static from(value: CerialUuidInput): CerialUuid {
    return new CerialUuid(value);
  }

  static fromString(str: string): CerialUuid {
    return new CerialUuid(str);
  }

  static fromNative(uuid: Uuid): CerialUuid {
    return new CerialUuid(uuid);
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }

  equals(other: CerialUuidInput): boolean {
    const otherValue =
      other instanceof CerialUuid
        ? other.value
        : isUuid(other)
          ? other.toString()
          : typeof other === 'string'
            ? other.toLowerCase()
            : '';

    return this.value === otherValue;
  }

  clone(): CerialUuid {
    return new CerialUuid(this);
  }

  toNative(): Uuid {
    return new Uuid(this.value);
  }

  /** Generate a random v4 UUID */
  static v4(): CerialUuid {
    const raw = crypto.randomUUID();

    return new CerialUuid(raw);
  }

  /** Generate a time-ordered v7 UUID */
  static v7(): CerialUuid {
    // UUIDv7: 48-bit timestamp (ms) + 4-bit version (0111) + 12-bit rand + 2-bit variant (10) + 62-bit rand
    const now = Date.now();
    const bytes = new Uint8Array(16);

    // Timestamp (48 bits, big-endian) in bytes 0-5
    bytes[0] = (now / 2 ** 40) & 0xff;
    bytes[1] = (now / 2 ** 32) & 0xff;
    bytes[2] = (now / 2 ** 24) & 0xff;
    bytes[3] = (now / 2 ** 16) & 0xff;
    bytes[4] = (now / 2 ** 8) & 0xff;
    bytes[5] = now & 0xff;

    // Fill remaining bytes with random data
    const rand = new Uint8Array(10);
    crypto.getRandomValues(rand);
    bytes.set(rand, 6);

    // Set version (0111 in bits 48-51 → byte 6 high nibble)
    bytes[6] = (bytes[6]! & 0x0f) | 0x70;

    // Set variant (10xx in bits 64-65 → byte 8 high 2 bits)
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;

    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

    return new CerialUuid(uuid);
  }

  /** Alias for from() — parse any CerialUuidInput into a CerialUuid */
  static parse(input: CerialUuidInput): CerialUuid {
    return CerialUuid.from(input);
  }
}

export function isCerialUuid(value: unknown): value is CerialUuid {
  return CerialUuid.is(value);
}
