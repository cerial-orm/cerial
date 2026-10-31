import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(__dirname, '../../../../bin/cerial.ts');
const TS_SCHEMA = `import { model } from 'cerial';\nexport const   User  =   model('User',{});\n`;
const MESSY_CERIAL = 'model   User{\nid Record   @id\n  name   String\n}\n';

const dirs: string[] = [];

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-format-cmd-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }

  return dir;
}

async function runFormat(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', CLI, 'format', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { code, stdout, stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('cerial format command', () => {
  it('exits zero and says nothing was formatted in a TypeScript-only project', async () => {
    const dir = project({ 'schema.ts': TS_SCHEMA, 'models/user.ts': TS_SCHEMA });
    const { code, stdout, stderr } = await runFormat(dir);

    expect(code).toBe(0);
    expect(stdout).toContain('No .cerial files found, nothing to format');
    expect(stderr).toBe('');
    expect(readFileSync(join(dir, 'schema.ts'), 'utf-8')).toBe(TS_SCHEMA);
    expect(readFileSync(join(dir, 'models/user.ts'), 'utf-8')).toBe(TS_SCHEMA);
  });

  it('does not claim the empty result when a .cerial file was formatted', async () => {
    const dir = project({ 'schema.cerial': MESSY_CERIAL });
    const { code, stdout } = await runFormat(dir);

    expect(code).toBe(0);
    expect(stdout).not.toContain('No .cerial files found');
    expect(stdout).toContain('formatted 1');
  });

  it('formats .cerial files in a mixed directory and leaves every .ts file byte identical', async () => {
    const dir = project({
      'schema.cerial': MESSY_CERIAL,
      'extra.ts': TS_SCHEMA,
      'nested/more.ts': TS_SCHEMA,
    });
    const { code } = await runFormat(dir);

    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'schema.cerial'), 'utf-8')).not.toBe(MESSY_CERIAL);
    expect(readFileSync(join(dir, 'extra.ts'), 'utf-8')).toBe(TS_SCHEMA);
    expect(readFileSync(join(dir, 'nested/more.ts'), 'utf-8')).toBe(TS_SCHEMA);
  });

  it('leaves .ts files untouched when formatting an explicit mixed directory with -s', async () => {
    const dir = project({ 'a.cerial': MESSY_CERIAL, 'a.ts': TS_SCHEMA });
    const { code } = await runFormat(dir, '-s', dir);

    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'a.ts'), 'utf-8')).toBe(TS_SCHEMA);
  });
});
