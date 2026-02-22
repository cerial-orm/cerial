import { describe, expect, test } from 'bun:test';
import { CerialBytes, isCerialBytes } from '../../../src/utils/cerial-bytes';

describe('CerialBytes', () => {
  const sampleData = new Uint8Array([72, 101, 108, 108, 111]);
  const sampleBase64 = Buffer.from(sampleData).toString('base64');

  test('construct from Uint8Array', () => {
    const bytes = new CerialBytes(sampleData);
    expect(bytes.length).toBe(5);
    expect(bytes.toUint8Array()).toEqual(sampleData);
  });

  test('construct from base64 string', () => {
    const bytes = new CerialBytes(sampleBase64);
    expect(bytes.toUint8Array()).toEqual(sampleData);
  });

  test('construct from CerialBytes', () => {
    const original = new CerialBytes(sampleData);
    const copy = new CerialBytes(original);
    expect(copy.toUint8Array()).toEqual(sampleData);
  });

  test('construct from Buffer', () => {
    const buf = Buffer.from([1, 2, 3]);
    const bytes = new CerialBytes(buf);
    expect(bytes.length).toBe(3);
    expect(bytes.toUint8Array()[0]).toBe(1);
  });

  test('throws on invalid input', () => {
    expect(() => new CerialBytes(42 as unknown as Uint8Array)).toThrow('Invalid input type for CerialBytes');
  });

  test('static from()', () => {
    const bytes = CerialBytes.from(sampleData);
    expect(CerialBytes.is(bytes)).toBe(true);
    expect(bytes.length).toBe(5);
  });

  test('static fromBase64()', () => {
    const bytes = CerialBytes.fromBase64(sampleBase64);
    expect(bytes.toUint8Array()).toEqual(sampleData);
  });

  test('static fromBuffer()', () => {
    const bytes = CerialBytes.fromBuffer(Buffer.from(sampleData));
    expect(bytes.toUint8Array()).toEqual(sampleData);
  });

  test('static is()', () => {
    expect(CerialBytes.is(new CerialBytes(sampleData))).toBe(true);
    expect(CerialBytes.is(sampleData)).toBe(false);
    expect(CerialBytes.is('hello')).toBe(false);
    expect(CerialBytes.is(null)).toBe(false);
    expect(CerialBytes.is(undefined)).toBe(false);
  });

  test('isCerialBytes()', () => {
    expect(isCerialBytes(new CerialBytes(sampleData))).toBe(true);
    expect(isCerialBytes(sampleData)).toBe(false);
  });

  test('length and byteLength', () => {
    const bytes = new CerialBytes(new Uint8Array([1, 2, 3, 4]));
    expect(bytes.length).toBe(4);
    expect(bytes.byteLength).toBe(4);
  });

  test('toBase64()', () => {
    const bytes = new CerialBytes(sampleData);
    expect(bytes.toBase64()).toBe(sampleBase64);
  });

  test('toString() returns base64', () => {
    const bytes = new CerialBytes(sampleData);
    expect(bytes.toString()).toBe(sampleBase64);
  });

  test('toJSON() returns base64', () => {
    const bytes = new CerialBytes(sampleData);
    expect(bytes.toJSON()).toBe(sampleBase64);
    expect(JSON.stringify({ data: bytes })).toBe(`{"data":"${sampleBase64}"}`);
  });

  test('toBuffer()', () => {
    const bytes = new CerialBytes(sampleData);
    const buf = bytes.toBuffer();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(5);
  });

  test('toNative() returns Uint8Array', () => {
    const bytes = new CerialBytes(sampleData);
    const native = bytes.toNative();
    expect(native).toBeInstanceOf(Uint8Array);
    expect(native).toEqual(sampleData);
  });

  test('clone() creates independent copy', () => {
    const original = new CerialBytes(new Uint8Array([1, 2, 3]));
    const cloned = original.clone();
    expect(cloned.equals(original)).toBe(true);
    expect(cloned).not.toBe(original);
  });

  test('equals() with CerialBytes', () => {
    const a = new CerialBytes(new Uint8Array([1, 2, 3]));
    const b = new CerialBytes(new Uint8Array([1, 2, 3]));
    const c = new CerialBytes(new Uint8Array([1, 2, 4]));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  test('equals() with Uint8Array', () => {
    const bytes = new CerialBytes(new Uint8Array([10, 20]));
    expect(bytes.equals(new Uint8Array([10, 20]))).toBe(true);
    expect(bytes.equals(new Uint8Array([10, 21]))).toBe(false);
  });

  test('equals() with base64 string', () => {
    const data = new Uint8Array([1, 2, 3]);
    const bytes = new CerialBytes(data);
    const b64 = Buffer.from(data).toString('base64');
    expect(bytes.equals(b64)).toBe(true);
  });

  test('equals() different lengths returns false', () => {
    const a = new CerialBytes(new Uint8Array([1, 2]));
    const b = new CerialBytes(new Uint8Array([1, 2, 3]));
    expect(a.equals(b)).toBe(false);
  });

  test('empty bytes', () => {
    const bytes = new CerialBytes(new Uint8Array([]));
    expect(bytes.length).toBe(0);
    expect(bytes.toBase64()).toBe('');
    expect(bytes.equals(new Uint8Array([]))).toBe(true);
  });

  test('roundtrip base64', () => {
    const original = new Uint8Array([0, 127, 255, 128, 64]);
    const bytes = new CerialBytes(original);
    const b64 = bytes.toBase64();
    const restored = CerialBytes.fromBase64(b64);
    expect(restored.toUint8Array()).toEqual(original);
  });
});
