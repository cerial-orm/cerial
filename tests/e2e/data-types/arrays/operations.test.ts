/**
 * E2E Tests for Array Operations
 *
 * Tests primitive array types (String[], Int[], Date[]) and array operators.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Array Operations', () => {
  const { getClient } = setupDataTypeTests(tables.core);

  describe('Create with arrays', () => {
    test('should create with empty arrays by default', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user.nicknames).toEqual([]);
      expect(user.scores).toEqual([]);
      expect(user.loginDates).toEqual([]);
    });

    test('should create with String[] values', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1', 'nick2', 'nick3'],
        },
      });

      expect(user.nicknames).toEqual(['nick1', 'nick2', 'nick3']);
    });

    test('should create with Int[] values', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          scores: [100, 95, 88],
        },
      });

      expect(user.scores).toEqual([100, 95, 88]);
    });

    test('should create with Date[] values', async () => {
      const client = getClient();
      const dates = [new Date('2024-01-01'), new Date('2024-02-01')];
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          loginDates: dates,
        },
      });

      expect(user.loginDates).toHaveLength(2);
    });
  });

  describe('Update with push', () => {
    test('should push single element to String[]', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1'],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { nicknames: { push: 'nick2' } },
      });

      expect(updated[0]?.nicknames).toContain('nick1');
      expect(updated[0]?.nicknames).toContain('nick2');
    });

    test('should push multiple elements to Int[]', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          scores: [100],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { scores: { push: [95, 88] } },
      });

      expect(updated[0]?.scores).toContain(100);
      expect(updated[0]?.scores).toContain(95);
      expect(updated[0]?.scores).toContain(88);
    });
  });

  describe('Update with unset', () => {
    test('should unset single element from String[]', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['nick1', 'nick2', 'nick3'],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { nicknames: { unset: 'nick2' } },
      });

      expect(updated[0]?.nicknames).toContain('nick1');
      expect(updated[0]?.nicknames).not.toContain('nick2');
      expect(updated[0]?.nicknames).toContain('nick3');
    });

    test('should unset multiple elements from Int[]', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          scores: [100, 95, 88, 75],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { scores: { unset: [95, 75] } },
      });

      expect(updated[0]?.scores).toContain(100);
      expect(updated[0]?.scores).not.toContain(95);
      expect(updated[0]?.scores).toContain(88);
      expect(updated[0]?.scores).not.toContain(75);
    });
  });

  describe('Update with direct assignment', () => {
    test('should replace entire array', async () => {
      const client = getClient();
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          nicknames: ['old1', 'old2'],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { nicknames: ['new1', 'new2', 'new3'] },
      });

      expect(updated[0]?.nicknames).toEqual(['new1', 'new2', 'new3']);
    });
  });

  describe('Query with array operators', () => {
    beforeEach(async () => {
      const client = getClient();
      await client.db.User.create({
        data: {
          email: 'user1@example.com',
          name: 'User 1',
          isActive: true,
          nicknames: ['alpha', 'beta'],
          scores: [100, 90],
        },
      });
      await client.db.User.create({
        data: {
          email: 'user2@example.com',
          name: 'User 2',
          isActive: true,
          nicknames: ['gamma'],
          scores: [85],
        },
      });
      await client.db.User.create({
        data: {
          email: 'user3@example.com',
          name: 'User 3',
          isActive: true,
          nicknames: [],
          scores: [],
        },
      });
    });

    test('should find with has operator', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { nicknames: { has: 'alpha' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('user1@example.com');
    });

    test('should find with hasAll operator', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { nicknames: { hasAll: ['alpha', 'beta'] } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('user1@example.com');
    });

    test('should find with hasAny operator', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { nicknames: { hasAny: ['alpha', 'gamma'] } },
      });

      expect(results).toHaveLength(2);
    });

    test('should find with isEmpty operator (true)', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { nicknames: { isEmpty: true } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('user3@example.com');
    });

    test('should find with isEmpty operator (false)', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { nicknames: { isEmpty: false } },
      });

      expect(results).toHaveLength(2);
    });

    test('should find with has on Int[]', async () => {
      const client = getClient();
      const results = await client.db.User.findMany({
        where: { scores: { has: 100 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('user1@example.com');
    });
  });
});
