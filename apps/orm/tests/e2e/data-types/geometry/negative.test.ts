import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Geometry: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.geometry);

  test('rejects string as geometry value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.GeometryBasic.create({
          data: {
            name: 'str-geo',
            // @ts-expect-error — intentionally passing string instead of geometry input
            location: 'not-a-geometry',
            area: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            shape: [0, 0],
            route: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            multi: [0, 0],
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects object without type property as geometry', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.GeometryBasic.create({
          data: {
            name: 'no-type',
            // @ts-expect-error — intentionally passing plain object without GeoJSON type
            location: { x: 10, y: 20 },
            area: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            shape: [0, 0],
            route: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            multi: [0, 0],
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects unknown GeoJSON type string', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.GeometryBasic.create({
          data: {
            name: 'bad-type',
            // @ts-expect-error — intentionally passing invalid GeoJSON type
            location: { type: 'Circle', coordinates: [0, 0] },
            area: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            shape: [0, 0],
            route: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            multi: [0, 0],
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects number as geometry value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.GeometryBasic.create({
          data: {
            name: 'num-geo',
            // @ts-expect-error — intentionally passing number instead of geometry input
            location: 42,
            area: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            shape: [0, 0],
            route: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            multi: [0, 0],
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects single-element array as point coordinates', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.GeometryBasic.create({
          data: {
            name: 'bad-coords',
            // @ts-expect-error — intentionally passing wrong array shape for point
            location: [42],
            area: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            },
            shape: [0, 0],
            route: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            multi: [0, 0],
          },
        });
      })(),
    ).rejects.toThrow();
  });
});
