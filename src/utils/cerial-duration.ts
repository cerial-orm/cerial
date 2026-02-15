import { Duration } from 'surrealdb';

export type CerialDurationInput = CerialDuration | Duration | string;

const DURATION_REGEX = /^(\d+y)?(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?(\d+ms)?(\d+us|\d+µs)?(\d+ns)?$/;

function isDuration(value: unknown): value is Duration {
  return value instanceof Duration;
}

export class CerialDuration {
  private readonly _native: Duration;

  constructor(input: CerialDurationInput) {
    if (input instanceof CerialDuration) {
      this._native = input._native;
    } else if (isDuration(input)) {
      this._native = input;
    } else if (typeof input === 'string') {
      if (!input || !DURATION_REGEX.test(input)) {
        throw new Error(`Invalid duration string: ${input}`);
      }
      this._native = new Duration(input);
    } else {
      throw new Error(`Invalid input type for CerialDuration: ${typeof input}`);
    }
  }

  static is(value: unknown): value is CerialDuration {
    return value instanceof CerialDuration;
  }

  static from(value: CerialDurationInput): CerialDuration {
    return new CerialDuration(value);
  }

  static parse(input: CerialDurationInput): CerialDuration {
    return CerialDuration.from(input);
  }

  // ─── Accessors (total in each unit) ─────────────────────────────────

  get years(): number {
    return Number(this._native.years);
  }

  get weeks(): number {
    return Number(this._native.weeks);
  }

  get days(): number {
    return Number(this._native.days);
  }

  get hours(): number {
    return Number(this._native.hours);
  }

  get minutes(): number {
    return Number(this._native.minutes);
  }

  get seconds(): number {
    return Number(this._native.seconds);
  }

  get milliseconds(): number {
    return Number(this._native.milliseconds);
  }

  get microseconds(): number {
    return Number(this._native.microseconds);
  }

  get nanoseconds(): number {
    return Number(this._native.nanoseconds);
  }

  // ─── Serialization ──────────────────────────────────────────────────

  toString(): string {
    return this._native.toString();
  }

  toJSON(): string {
    return this._native.toString();
  }

  valueOf(): number {
    return Number(this._native.milliseconds);
  }

  // ─── Comparison ─────────────────────────────────────────────────────

  equals(other: CerialDurationInput): boolean {
    const otherDuration = other instanceof CerialDuration ? other._native : new CerialDuration(other)._native;

    return this._native.toString() === otherDuration.toString();
  }

  compareTo(other: CerialDurationInput): number {
    const otherMs = other instanceof CerialDuration ? other.milliseconds : new CerialDuration(other).milliseconds;

    return this.milliseconds - otherMs;
  }

  // ─── SDK Interop ────────────────────────────────────────────────────

  toNative(): Duration {
    return this._native;
  }

  clone(): CerialDuration {
    return new CerialDuration(this);
  }
}

export function isCerialDuration(value: unknown): value is CerialDuration {
  return CerialDuration.is(value);
}
