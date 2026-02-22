export type CerialBytesInput = CerialBytes | Uint8Array | string;

// Helper: base64 encode/decode
function base64ToUint8Array(base64: string): Uint8Array {
  return Buffer.from(base64, 'base64');
}

function uint8ArrayToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

export class CerialBytes {
  private readonly _data: Uint8Array;

  constructor(input: CerialBytesInput) {
    if (input instanceof CerialBytes) {
      this._data = input._data;
    } else if (input instanceof Uint8Array) {
      this._data = input;
    } else if (typeof input === 'string') {
      this._data = base64ToUint8Array(input);
    } else {
      throw new Error(`Invalid input type for CerialBytes: ${typeof input}`);
    }
  }

  // ─── Static Factories ───────────────────────────────────────────────

  static is(value: unknown): value is CerialBytes {
    return value instanceof CerialBytes;
  }

  static from(value: CerialBytesInput): CerialBytes {
    return new CerialBytes(value);
  }

  static fromBase64(base64: string): CerialBytes {
    return new CerialBytes(base64);
  }

  static fromBuffer(buffer: Buffer | Uint8Array): CerialBytes {
    return new CerialBytes(buffer);
  }

  // ─── Properties ─────────────────────────────────────────────────────

  get length(): number {
    return this._data.length;
  }

  get byteLength(): number {
    return this._data.byteLength;
  }

  // ─── Conversion ─────────────────────────────────────────────────────

  toUint8Array(): Uint8Array {
    return this._data;
  }

  toBuffer(): Buffer {
    return Buffer.from(this._data);
  }

  toBase64(): string {
    return uint8ArrayToBase64(this._data);
  }

  toString(): string {
    return this.toBase64();
  }

  toJSON(): string {
    return this.toBase64();
  }

  // ─── Comparison ─────────────────────────────────────────────────────

  equals(other: CerialBytesInput): boolean {
    const otherBytes = other instanceof CerialBytes ? other._data : new CerialBytes(other)._data;
    if (this._data.length !== otherBytes.length) return false;
    for (let i = 0; i < this._data.length; i++) {
      if (this._data[i] !== otherBytes[i]) return false;
    }

    return true;
  }

  // ─── SDK Interop ────────────────────────────────────────────────────

  /** bytes are plain Uint8Array in SurrealDB SDK */
  toNative(): Uint8Array {
    return this._data;
  }

  clone(): CerialBytes {
    return new CerialBytes(new Uint8Array(this._data));
  }
}

export function isCerialBytes(value: unknown): value is CerialBytes {
  return CerialBytes.is(value);
}
