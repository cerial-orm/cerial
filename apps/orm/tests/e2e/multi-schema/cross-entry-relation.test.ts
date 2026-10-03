import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type GeneratedFixture, generateFixture } from './runtime-helpers';

describe('a relation pointing at a model in another schema entry', () => {
  let fixture: GeneratedFixture;

  beforeAll(async () => {
    fixture = await generateFixture('cross-relation');
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('fails the whole run without throwing', () => {
    expect(fixture.result.success).toBe(false);
  });

  it('fails only the entry that holds the dangling relation', () => {
    expect(fixture.result.results.items!.success).toBe(false);
    expect(fixture.result.results.owners!.success).toBe(true);
  });

  it('names the referencing field, the missing target and the schema entry', () => {
    const [message] = fixture.result.results.items!.errors;

    expect(message).toContain('Relation field "owner" references non-existent model "MsRtXOwner"');
    expect(message).toContain('item.cerial');
    expect(fixture.result.errors).toEqual([`[items] ${message}`]);
  });

  it('reports a readable message, not a stack trace or an undefined lookup', () => {
    for (const message of fixture.result.errors) {
      expect(message).not.toMatch(/\n\s+at /);
      expect(message).not.toContain('undefined');
      expect(message).not.toContain('TypeError');
    }
  });

  it('writes no files for the failed entry', async () => {
    expect(fixture.result.results.items!.files).toEqual([]);
    expect(await Bun.file(`${fixture.outputs.items}/client.ts`).exists()).toBe(false);
  });

  it('still writes a usable client for the entry that resolved', async () => {
    expect(await Bun.file(`${fixture.outputs.owners}/client.ts`).exists()).toBe(true);
  });
});
