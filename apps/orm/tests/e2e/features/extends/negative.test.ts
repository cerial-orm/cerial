/**
 * E2E Tests: Extends Negative Cases — generation failures
 *
 * Tests that `cerial generate` fails with proper error messages
 * for invalid extends configurations. Each test writes a temporary
 * .cerial schema file, runs generate, and checks stderr for errors.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP_BASE = join(tmpdir(), 'cerial-extends-negative');

function setupTmpDir(name: string): { schemaDir: string; outputDir: string } {
  const dir = join(TMP_BASE, name);
  const schemaDir = join(dir, 'schemas');
  const outputDir = join(dir, 'output');
  mkdirSync(schemaDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  return { schemaDir, outputDir };
}

function writeSchema(schemaDir: string, content: string, filename = 'test.cerial'): void {
  writeFileSync(join(schemaDir, filename), content, 'utf-8');
}

function runGenerate(schemaDir: string, outputDir: string): { exitCode: number; stderr: string } {
  try {
    execSync(`bun bin/cerial.ts generate -s "${schemaDir}" -o "${outputDir}"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { exitCode: 0, stderr: '' };
  } catch (err: unknown) {
    const error = err as { status: number; stderr: string; stdout: string };

    return { exitCode: error.status ?? 1, stderr: (error.stderr ?? '') + (error.stdout ?? '') };
  }
}

describe('E2E Extends: Negative Cases (Generation Failures)', () => {
  afterAll(() => {
    // Clean up all temp dirs
    try {
      rmSync(TMP_BASE, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ── Circular extends ──────────────────────────────────────────────────

  describe('circular extends', () => {
    test('model A extends B, B extends A → circular error', () => {
      const { schemaDir, outputDir } = setupTmpDir('circular-model');
      writeSchema(
        schemaDir,
        `model CircA extends CircB {
  id Record @id
  name String
}

model CircB extends CircA {
  id Record @id
  label String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('circular');
    });

    test('self-referencing model → circular error', () => {
      const { schemaDir, outputDir } = setupTmpDir('circular-self');
      writeSchema(
        schemaDir,
        `model SelfRef extends SelfRef {
  id Record @id
  name String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('circular');
    });

    test('three-way circular: A→B→C→A → circular error', () => {
      const { schemaDir, outputDir } = setupTmpDir('circular-three');
      writeSchema(
        schemaDir,
        `model CycA extends CycC {
  id Record @id
  a String
}

model CycB extends CycA {
  id Record @id
  b String
}

model CycC extends CycB {
  id Record @id
  c String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('circular');
    });

    test('circular object extends', () => {
      const { schemaDir, outputDir } = setupTmpDir('circular-object');
      writeSchema(
        schemaDir,
        `object ObjA extends ObjB {
  x String
}

object ObjB extends ObjA {
  y String
}

model Holder {
  id Record @id
  data ObjA
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('circular');
    });

    test('circular enum extends', () => {
      const { schemaDir, outputDir } = setupTmpDir('circular-enum');
      writeSchema(
        schemaDir,
        `enum EnA extends EnB { X }
enum EnB extends EnA { Y }

model Holder {
  id Record @id
  val EnA
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('circular');
    });
  });

  // ── Cross-kind extends ────────────────────────────────────────────────

  describe('cross-kind extends', () => {
    test('model extends object name → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('cross-model-object');
      writeSchema(
        schemaDir,
        `object SomeObj {
  field1 String
}

model BadModel extends SomeObj {
  id Record @id
  name String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('object');
      expect(stderr).toContain('model');
    });

    test('object extends model name → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('cross-object-model');
      writeSchema(
        schemaDir,
        `model SomeModel {
  id Record @id
  name String
}

object BadObj extends SomeModel {
  field1 String
}

model Holder {
  id Record @id
  data BadObj
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('model');
      expect(stderr).toContain('object');
    });

    test('enum extends literal name → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('cross-enum-literal');
      writeSchema(
        schemaDir,
        `literal SomeLit { 'a', 'b' }

enum BadEnum extends SomeLit { C }

model Holder {
  id Record @id
  val BadEnum
}`,
      );

      const { exitCode, stderr: _stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
    });
  });

  // ── Abstract extends concrete ─────────────────────────────────────────

  describe('abstract extends concrete', () => {
    test('abstract model extends concrete model → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('abstract-concrete');
      writeSchema(
        schemaDir,
        `model ConcreteBase {
  id Record @id
  name String
}

abstract model BadAbstract extends ConcreteBase {
  extra String
}

model Child extends BadAbstract {
  id Record @id
  age Int
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('abstract');
      expect(stderr.toLowerCase()).toContain('concrete');
    });
  });

  // ── Concrete extends concrete ─────────────────────────────────────────

  describe('concrete extends concrete', () => {
    test('concrete model extends concrete model → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('concrete-concrete');
      writeSchema(
        schemaDir,
        `model ConcreteParent {
  id Record @id
  name String
}

model ConcreteChild extends ConcreteParent {
  extra String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('concrete');
      expect(stderr).toContain('ConcreteChild');
    });

    test('concrete model can only extend abstract model', () => {
      const { schemaDir, outputDir } = setupTmpDir('concrete-needs-abstract');
      writeSchema(
        schemaDir,
        `abstract model AbsBase {
  id Record @id
  name String
}

model ConcreteChild extends AbsBase {
  extra String
}`,
      );

      const { exitCode } = runGenerate(schemaDir, outputDir);
      expect(exitCode).toBe(0);
    });

    test('multi-level concrete chain A→B→C → errors for B and C', () => {
      const { schemaDir, outputDir } = setupTmpDir('concrete-chain');
      writeSchema(
        schemaDir,
        `model A {
  id Record @id
  name String
}

model B extends A {
  extra String
}

model C extends B {
  more String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      // Both B extends A and C extends B should be reported
      expect(stderr).toContain('Models can only extend abstract models');
    });
  });

  // ── Nonexistent extends target ────────────────────────────────────────

  describe('nonexistent extends target', () => {
    test('model extends nonexistent model → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('nonexistent-model');
      writeSchema(
        schemaDir,
        `model Ghost extends NonExistentBase {
  id Record @id
  name String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('NonExistentBase');
      expect(stderr).toContain('no model');
    });

    test('object extends nonexistent object → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('nonexistent-object');
      writeSchema(
        schemaDir,
        `object BadObj extends MissingObj {
  field1 String
}

model Holder {
  id Record @id
  data BadObj
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('MissingObj');
    });

    test('tuple extends nonexistent tuple → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('nonexistent-tuple');
      writeSchema(
        schemaDir,
        `tuple BadTuple extends MissingTuple { String }

model Holder {
  id Record @id
  data BadTuple
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('MissingTuple');
    });
  });

  // ── Empty brackets ────────────────────────────────────────────────────

  describe('empty extends brackets', () => {
    test('model extends Y[] with empty brackets → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-model');
      writeSchema(
        schemaDir,
        `abstract model Base {
  id Record @id
  name String
}

model Child extends Base[] {
  age Int
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('empty');
    });

    test('object extends Y[] with empty brackets → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-object');
      writeSchema(
        schemaDir,
        `object BaseObj {
  street String
  city String
}

object ChildObj extends BaseObj[] {
  extra String
}

model Holder {
  id Record @id
  data ChildObj
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('empty');
    });

    test('enum extends Y[] with empty brackets → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-enum');
      writeSchema(
        schemaDir,
        `enum BaseEn { A, B, C }

enum ChildEn extends BaseEn[] { }

model Holder {
  id Record @id
  val ChildEn
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('empty');
    });
  });

  // ── Private field override ────────────────────────────────────────────

  describe('private field override', () => {
    test('child model overrides !!private field → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('private-override-model');
      writeSchema(
        schemaDir,
        `abstract model PrivBase {
  id Record @id !!private
  secret String !!private
}

model PrivChild extends PrivBase {
  secret String @default('overridden')
  name String
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('private');
      expect(stderr).toContain('secret');
    });

    test('child object overrides !!private field → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('private-override-object');
      writeSchema(
        schemaDir,
        `object PrivObjBase {
  internal String !!private
  visible String
}

object PrivObjChild extends PrivObjBase {
  internal String @default('hacked')
  extra Int
}

model Holder {
  id Record @id
  data PrivObjChild
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('private');
      expect(stderr).toContain('internal');
    });
  });

  // ── Empty types (no fields/elements/values) ────────────────────────────

  describe('empty types without extends', () => {
    test('empty model without extends → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-model-no-extends');
      writeSchema(
        schemaDir,
        `model EmptyModel {
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('EmptyModel');
      expect(stderr.toLowerCase()).toContain('no fields');
    });

    test('empty object without extends → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-object-no-extends');
      writeSchema(
        schemaDir,
        `object EmptyObj {
}

model Holder {
  id Record @id
  data EmptyObj
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('EmptyObj');
      expect(stderr.toLowerCase()).toContain('no fields');
    });

    test('empty enum without extends → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-enum-no-extends');
      writeSchema(
        schemaDir,
        `enum EmptyEnum { }

model Holder {
  id Record @id
  val EmptyEnum
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('EmptyEnum');
      expect(stderr.toLowerCase()).toContain('no values');
    });
  });

  // ── Empty after resolution (extends + omit-all) ───────────────────────

  describe('empty after resolution', () => {
    test('model extends with omit-all fields → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-after-omit-model');
      writeSchema(
        schemaDir,
        `abstract model Base {
  id Record @id
  name String
}

model OmitAll extends Base[!id, !name] {
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('no fields');
    });

    test('enum extends with omit-all values → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('empty-after-omit-enum');
      writeSchema(
        schemaDir,
        `enum BaseRole { Admin, User }

enum EmptyRole extends BaseRole[!Admin, !User] { }

model Holder {
  id Record @id
  role EmptyRole
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('no values');
    });
  });

  // ── Concrete model without @id ────────────────────────────────────────

  describe('concrete model without @id', () => {
    test('concrete model without extends and no @id → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('no-id-no-extends');
      writeSchema(
        schemaDir,
        `model NoIdModel {
  name String
  email Email
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('@id');
      expect(stderr).toContain('NoIdModel');
    });

    test('concrete model with @id from parent → passes', () => {
      const { schemaDir, outputDir } = setupTmpDir('id-from-parent');
      writeSchema(
        schemaDir,
        `abstract model IdBase {
  id Record @id
  name String
}

model IdChild extends IdBase {
  extra Int
}`,
      );

      const { exitCode } = runGenerate(schemaDir, outputDir);
      expect(exitCode).toBe(0);
    });
  });

  // ── Invalid pick/omit references ──────────────────────────────────────

  describe('invalid pick/omit references', () => {
    test('pick references nonexistent field → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('pick-bad-field');
      writeSchema(
        schemaDir,
        `abstract model PickBase {
  id Record @id
  name String
  email Email
}

model PickChild extends PickBase[name, nonExistentField] {
  extra Int
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('nonExistentField');
    });

    test('omit references nonexistent field → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('omit-bad-field');
      writeSchema(
        schemaDir,
        `abstract model OmitBase {
  id Record @id
  name String
}

model OmitChild extends OmitBase[!phantom] {
  extra Int
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('phantom');
    });

    test('tuple pick references out-of-bounds index → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('tuple-oob');
      writeSchema(
        schemaDir,
        `tuple BasePair { String, Int }

tuple BadPick extends BasePair[0, 5] { }

model Holder {
  id Record @id
  data BadPick
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('5');
      expect(stderr.toLowerCase()).toContain('out of bounds');
    });

    test('enum pick references nonexistent value → error', () => {
      const { schemaDir, outputDir } = setupTmpDir('enum-bad-pick');
      writeSchema(
        schemaDir,
        `enum BaseRole { ADMIN, USER }

enum BadPick extends BaseRole[ADMIN, SUPERADMIN] { }

model Holder {
  id Record @id
  val BadPick
}`,
      );

      const { exitCode, stderr } = runGenerate(schemaDir, outputDir);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('SUPERADMIN');
    });
  });
});
