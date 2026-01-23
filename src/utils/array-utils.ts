/**
 * Array utility functions
 */

/** Check if array is empty */
export function isEmpty<T>(arr: T[]): boolean {
  return arr.length === 0;
}

/** Check if array is not empty */
export function isNotEmpty<T>(arr: T[]): arr is [T, ...T[]] {
  return arr.length > 0;
}

/** Get first element or undefined */
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

/** Get last element or undefined */
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/** Remove duplicates from array */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Remove duplicates by key */
export function uniqueBy<T, K>(arr: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  return arr.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Flatten array one level deep */
export function flatten<T>(arr: T[][]): T[] {
  return arr.flat();
}

/** Group array by key */
export function groupBy<T, K extends string | number>(
  arr: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/** Partition array into two by predicate */
export function partition<T>(
  arr: T[],
  predicate: (item: T) => boolean,
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of arr) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  return [pass, fail];
}

/** Chunk array into smaller arrays */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Find index or -1 */
export function findIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}

/** Zip two arrays together */
export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const length = Math.min(a.length, b.length);
  const result: [A, B][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i]!, b[i]!]);
  }
  return result;
}
