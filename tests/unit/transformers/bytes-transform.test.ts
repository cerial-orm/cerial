import { describe, expect, test } from 'bun:test';
import { mapFieldValue } from '../../../src/query/mappers/result-mapper';
import { transformValue } from '../../../src/query/transformers/data-transformer';
import { CerialBytes } from '../../../src/utils/cerial-bytes';

describe('bytes transformer', () => {
  test('transformValue passes through Uint8Array', () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = transformValue(data, 'bytes');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(data);
  });

  test('transformValue converts CerialBytes to Uint8Array', () => {
    const bytes = CerialBytes.from(new Uint8Array([4, 5, 6]));
    const result = transformValue(bytes, 'bytes');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([4, 5, 6]));
  });

  test('transformValue converts base64 string to Uint8Array', () => {
    const data = new Uint8Array([7, 8, 9]);
    const b64 = Buffer.from(data).toString('base64');
    const result = transformValue(b64, 'bytes');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(data);
  });

  test('transformValue passes null through', () => {
    expect(transformValue(null, 'bytes')).toBeNull();
  });

  test('transformValue passes undefined through', () => {
    expect(transformValue(undefined, 'bytes')).toBeUndefined();
  });
});

describe('bytes result mapper', () => {
  test('mapFieldValue converts Uint8Array to CerialBytes', () => {
    const data = new Uint8Array([10, 20, 30]);
    const result = mapFieldValue(data, 'bytes');
    expect(CerialBytes.is(result)).toBe(true);
    expect((result as CerialBytes).toUint8Array()).toEqual(data);
  });

  test('mapFieldValue passes null through', () => {
    expect(mapFieldValue(null, 'bytes')).toBeNull();
  });

  test('mapFieldValue passes undefined through', () => {
    expect(mapFieldValue(undefined, 'bytes')).toBeUndefined();
  });

  test('mapFieldValue passes non-Uint8Array through', () => {
    // Annotate as unknown — overload narrows to CerialBytes but runtime passes through non-Uint8Array values
    const result: unknown = mapFieldValue('not-bytes', 'bytes');
    expect(result).toBe('not-bytes');
  });
});
