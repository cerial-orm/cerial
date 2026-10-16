import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedSchemaEntry } from '../../../src/cli/config';
import { generateMultiSchema, generateSingleSchema } from '../../../src/cli/generate';
import { validateConnectionUrls } from '../../../src/cli/validators';
import { CerialGenerationError } from '../../../src/errors';

function message(url: string, name = 'main'): string {
  try {
    validateConnectionUrls([{ name, connection: { url } }]);
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return (error as Error).message;
  }

  return '';
}

describe('validateConnectionUrls refuses credentials in the url', () => {
  test.each([
    ['username and password', 'ws://u:p@host:8000/rpc'],
    ['username only', 'ws://u@host/rpc'],
    ['password only', 'ws://:p@host/rpc'],
    ['encoded credential', 'ws://us%40er:p%3Aw%2Fd@host/rpc'],
    ['http url', 'http://u:p@host:8000'],
    ['https url', 'https://u:p@host'],
    ['wss url', 'wss://u:p@host/rpc'],
    ['credentials with a path @', 'ws://u:p@host/a@b'],
    ['unparseable url with userinfo', 'ws://u:p@[bad'],
  ])('%s', (_label, url) => {
    expect(message(url)).toContain("entry 'main'");
  });

  test('names every offending entry and skips clean ones', () => {
    expect(() =>
      validateConnectionUrls([
        { name: 'a', connection: { url: 'ws://u:p@h/rpc' } },
        { name: 'b', connection: { url: 'ws://h/rpc' } },
        { name: 'c', connection: { url: 'http://u@h' } },
        { name: 'd' },
      ]),
    ).toThrow("entries 'a', 'c' have");
  });

  test('says what to do instead and that nothing was generated', () => {
    const msg = message('ws://u:p@host/rpc');

    expect(msg).toContain('CERIAL_DB_USER');
    expect(msg).toContain('CERIAL_DB_PASS');
    expect(msg).toContain('connect()');
    expect(msg).toContain('committed');
    expect(msg).toContain('Nothing was generated');
  });

  test('never echoes any part of the url, credential or host', () => {
    for (const url of ['ws://fakeuser:fakepass@secret-host:8000/rpc', 'ws://us%40er:p%3Aw@secret-host/rpc']) {
      const msg = message(url);

      expect(msg).not.toContain('fakeuser');
      expect(msg).not.toContain('fakepass');
      expect(msg).not.toContain('us%40er');
      expect(msg).not.toContain('p%3Aw');
      expect(msg).not.toContain('secret-host');
      expect(msg).not.toContain('ws://');
    }
  });
});

describe('validateConnectionUrls allows urls without credentials', () => {
  test.each([
    ['plain ws', 'ws://host:8000/rpc'],
    ['plain http', 'http://host:8000'],
    ['port, path and query', 'https://host:8443/base/path?mode=a&x=1'],
    ['@ in the path', 'ws://host:8000/rpc/a@b'],
    ['@ in the query', 'http://host:8000/?email=a@b.com'],
    ['@ in the fragment', 'http://host:8000/#frag@x'],
    ['empty userinfo', 'ws://@host/rpc'],
  ])('%s', (_label, url) => {
    expect(message(url)).toBe('');
  });

  test('allows an entry with no connection', () => {
    expect(() => validateConnectionUrls([{ name: 'a' }])).not.toThrow();
  });
});

describe('generation refuses credentials in the url before writing', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cerial-conn-url-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeEntry(name: string, url?: string): Promise<ResolvedSchemaEntry> {
    const path = join(root, name, 'schemas');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'schema.cerial'), `model Item${name.length} {\n  id Record @id\n  label String\n}\n`);

    return {
      name,
      path,
      output: join(root, name, 'client'),
      clientClassName: `${name}Client`,
      connection: url ? { url } : undefined,
    };
  }

  test('generateMultiSchema refuses and writes no entry, even a clean one listed first', async () => {
    const clean = await makeEntry('alpha', 'ws://host:8000/rpc');
    const bad = await makeEntry('beta', 'ws://fakeuser:fakepass@host:8000/rpc');

    const failure = await generateMultiSchema([clean, bad], {}).then(
      () => undefined,
      (error: Error) => error,
    );

    expect(failure?.message).toContain("entry 'beta'");
    expect(failure?.message).not.toContain('fakepass');
    expect(existsSync(clean.output)).toBe(false);
    expect(existsSync(bad.output)).toBe(false);
  });

  test('generateMultiSchema generates entries whose urls are clean', async () => {
    const a = await makeEntry('alpha', 'ws://host:8000/rpc/a@b');
    const b = await makeEntry('beta');

    const result = await generateMultiSchema([a, b], {});

    expect(result.errors).toEqual([]);
    expect(existsSync(a.output)).toBe(true);
    expect(existsSync(b.output)).toBe(true);
  });

  test('generateSingleSchema refuses and writes nothing', async () => {
    const bad = await makeEntry('alpha');

    await expect(
      generateSingleSchema({
        schemaPath: bad.path,
        outputDir: bad.output,
        connection: { url: 'http://u:p@host:8000' },
      }),
    ).rejects.toThrow('carries credentials');
    expect(existsSync(bad.output)).toBe(false);
  });
});
