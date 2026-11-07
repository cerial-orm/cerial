import { Decimal } from 'surrealdb';
import { CerialValidationError } from '../errors';

export type CerialDecimalInput = CerialDecimal | Decimal | number | string;

function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

/**
 * The SDK's decimal parser reads a prefix and returns 0 for anything it cannot parse ('1,5', '12abc',
 * 'NaN'), so a string is checked in full here before it reaches it.
 */
const DECIMAL_STRING = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** True for a value a Decimal field accepts: a finite number, a decimal wrapper, or a fully parseable string. */
export function isValidDecimalInput(value: unknown): boolean {
  if (value instanceof CerialDecimal || value instanceof Decimal) return true;
  if (typeof value === 'number') return Number.isFinite(value);

  return typeof value === 'string' && DECIMAL_STRING.test(value);
}

export class CerialDecimal {
  private readonly _native: Decimal;

  constructor(input: CerialDecimalInput) {
    if (input instanceof CerialDecimal) {
      this._native = input._native;
    } else if (isDecimal(input)) {
      this._native = input;
    } else if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new CerialValidationError(`Invalid decimal number: ${input}`);
      this._native = new Decimal(input);
    } else if (typeof input === 'string') {
      if (!input) {
        throw new CerialValidationError('Invalid decimal string: empty string');
      }
      if (!isValidDecimalInput(input)) throw new CerialValidationError(`Invalid decimal string: '${input}'`);
      this._native = new Decimal(input);
    } else {
      throw new CerialValidationError(`Invalid input type for CerialDecimal: ${typeof input}`);
    }
  }

  static is(value: unknown): value is CerialDecimal {
    return value instanceof CerialDecimal;
  }

  static from(value: CerialDecimalInput): CerialDecimal {
    return new CerialDecimal(value);
  }

  static parse(input: CerialDecimalInput): CerialDecimal {
    return CerialDecimal.from(input);
  }

  // ─── Arithmetic (immutable, return new CerialDecimal) ───────────────

  add(other: CerialDecimalInput): CerialDecimal {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return new CerialDecimal(this._native.add(otherNative));
  }

  sub(other: CerialDecimalInput): CerialDecimal {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return new CerialDecimal(this._native.sub(otherNative));
  }

  mul(other: CerialDecimalInput): CerialDecimal {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return new CerialDecimal(this._native.mul(otherNative));
  }

  div(other: CerialDecimalInput): CerialDecimal {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return new CerialDecimal(this._native.div(otherNative));
  }

  // ─── Comparison ─────────────────────────────────────────────────────

  equals(other: CerialDecimalInput): boolean {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return this._native.compare(otherNative) === 0;
  }

  compareTo(other: CerialDecimalInput): number {
    const otherNative = other instanceof CerialDecimal ? other._native : new CerialDecimal(other)._native;

    return this._native.compare(otherNative);
  }

  isZero(): boolean {
    return this._native.compare(new Decimal(0)) === 0;
  }

  isNegative(): boolean {
    return this._native.compare(new Decimal(0)) < 0;
  }

  // ─── Conversion ─────────────────────────────────────────────────────

  /** Convert to JavaScript number. WARNING: This is LOSSY for large/precise decimals! */
  toNumber(): number {
    return this._native.toFloat();
  }

  toString(): string {
    return this._native.toString();
  }

  toJSON(): string {
    return this._native.toString();
  }

  valueOf(): number {
    return this._native.toFloat();
  }

  // ─── SDK Interop ────────────────────────────────────────────────────

  toNative(): Decimal {
    return this._native;
  }

  clone(): CerialDecimal {
    return new CerialDecimal(this);
  }
}

export function isCerialDecimal(value: unknown): value is CerialDecimal {
  return CerialDecimal.is(value);
}
