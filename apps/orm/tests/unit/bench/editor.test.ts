import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumerSource, syntheticConsumerSpec } from '../../../bench/consumer';
import { measureCase } from '../../../bench/curve';
import {
  FrameError,
  FrameParser,
  StdioSession,
  formatEditor,
  lspProtocol,
  measureIncremental,
  measureServer,
  parseEditorArgs,
  position,
  probeEdit,
  probeSevenServer,
  tsserverPath,
  tsserverProtocol,
} from '../../../bench/editor';
import { syntheticSchema } from '../../../bench/schema';

const DIST = join(import.meta.dir, '..', '..', '..', 'dist', 'index.d.mts');
const withDist = existsSync(DIST) ? describe : describe.skip;

const frame = (payload: unknown, tail = ''): string => {
  const json = JSON.stringify(payload);

  return `Content-Length: ${Buffer.byteLength(json) + tail.length}\r\n\r\n${json}${tail}`;
};

describe('frame parser', () => {
  test('parses one frame', () => {
    expect(new FrameParser().push(Buffer.from(frame({ a: 1 })))).toEqual([{ a: 1 }]);
  });

  test('parses several frames from one chunk, tolerating the newline tsserver adds after each', () => {
    const chunk = Buffer.from(frame({ a: 1 }, '\n') + frame({ b: 2 }, '\r\n'));

    expect(new FrameParser().push(chunk)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test('a frame cut at every byte, inside a multi-byte character, still parses once whole', () => {
    const bytes = Buffer.from(frame({ text: 'héllo ✓' }));
    const parser = new FrameParser();
    const out: unknown[] = [];
    for (const byte of bytes) out.push(...parser.push(Uint8Array.of(byte)));

    expect(out).toEqual([{ text: 'héllo ✓' }]);
  });

  test('counts Content-Length in bytes, not characters', () => {
    expect(new FrameParser().push(Buffer.from(frame({ t: '✓✓' })))).toEqual([{ t: '✓✓' }]);
  });

  test('a partial body returns nothing until the rest arrives', () => {
    const bytes = Buffer.from(frame({ a: 1 }));
    const parser = new FrameParser();

    expect(parser.push(bytes.subarray(0, bytes.length - 2))).toEqual([]);
    expect(parser.push(bytes.subarray(bytes.length - 2))).toEqual([{ a: 1 }]);
  });

  test('a header with no Content-Length is refused', () => {
    expect(() => new FrameParser().push(Buffer.from('Content-Type: x\r\n\r\n{}'))).toThrow(FrameError);
  });

  test('a non-numeric Content-Length is refused', () => {
    expect(() => new FrameParser().push(Buffer.from('Content-Length: abc\r\n\r\n{}'))).toThrow(/Content-Length/);
  });

  test('a body that is not JSON is refused', () => {
    expect(() => new FrameParser().push(Buffer.from('Content-Length: 5\r\n\r\n{nope'))).toThrow(/not JSON/);
  });
});

describe('protocols', () => {
  test('tsserver replies match on request_seq and events match nothing', () => {
    expect(tsserverProtocol.reply({ type: 'response', request_seq: 4, success: true, body: [1] })).toEqual({
      id: 4,
      ok: true,
      body: [1],
      error: undefined,
    });
    expect(tsserverProtocol.reply({ type: 'event', event: 'projectLoadingFinish' })).toBeNull();
  });

  test('LSP: a result is a reply, a server request is not, and it is answered', () => {
    expect(lspProtocol.reply({ jsonrpc: '2.0', id: 2, result: { x: 1 } })).toMatchObject({ id: 2, ok: true });
    expect(lspProtocol.reply({ jsonrpc: '2.0', id: 2, error: { message: 'bad' } })).toMatchObject({
      ok: false,
      error: 'bad',
    });

    const request = { jsonrpc: '2.0', id: 9, method: 'client/registerCapability', params: {} };

    expect(lspProtocol.reply(request)).toBeNull();
    expect(lspProtocol.answerServerRequest(request)).toContain('"id":9');
    expect(lspProtocol.answerServerRequest({ jsonrpc: '2.0', method: 'window/logMessage' })).toBeNull();
  });
});

/** A node script standing in for a server: replies to `slow` only after `fast`, preceded by an event and a stray reply */
const REORDERING_SERVER = `
const frame = (o) => { const j = JSON.stringify(o); return 'Content-Length: ' + Buffer.byteLength(j) + '\\r\\n\\r\\n' + j; };
let held = null;
let buffered = '';
process.stdin.on('data', (d) => {
  buffered += d;
  let nl;
  while ((nl = buffered.indexOf('\\n')) >= 0) {
    const req = JSON.parse(buffered.slice(0, nl));
    buffered = buffered.slice(nl + 1);
    if (req.command === 'slow') { held = req; continue; }
    if (req.command === 'broken') { process.stdout.write(frame({ type: 'response', request_seq: req.seq, success: false, message: 'nope' })); continue; }
    process.stdout.write(frame({ type: 'event', event: 'noise' }));
    process.stdout.write(frame({ type: 'response', request_seq: 9999, success: true, body: 'stray' }));
    process.stdout.write(frame({ type: 'response', request_seq: req.seq, success: true, body: 'fast-' + req.seq }));
    if (held) process.stdout.write(frame({ type: 'response', request_seq: held.seq, success: true, body: 'slow-' + held.seq }));
  }
});`;

const FAKE = ['node', '-e', REORDERING_SERVER];

describe('stdio session', () => {
  test('each request gets its own reply even when the server answers out of order', async () => {
    const session = new StdioSession(FAKE, tmpdir(), tsserverProtocol, 5000);
    try {
      const slow = session.request('slow', {});
      const fast = session.request('fast', {});

      expect(await Promise.all([slow, fast])).toEqual(['slow-1', 'fast-2']);
    } finally {
      session.kill();
    }
  });

  test('a failed reply rejects with the server message', async () => {
    const session = new StdioSession(FAKE, tmpdir(), tsserverProtocol, 5000);
    try {
      await expect(session.request('broken', {})).rejects.toThrow('broken failed: nope');
    } finally {
      session.kill();
    }
  });

  test('a server that never answers fails the request at the timeout', async () => {
    const session = new StdioSession(['node', '-e', 'setInterval(() => {}, 1000)'], tmpdir(), tsserverProtocol, 150);
    try {
      const started = performance.now();

      await expect(session.request('hang', {})).rejects.toThrow('hang timed out after 150 ms');
      expect(performance.now() - started).toBeLessThan(3000);
    } finally {
      session.kill();
    }
  });

  test('a server that exits rejects what is outstanding instead of hanging', async () => {
    const session = new StdioSession(
      ['node', '-e', 'setTimeout(() => process.exit(3), 50)'],
      tmpdir(),
      tsserverProtocol,
      5000,
    );

    await expect(session.request('anything', {})).rejects.toThrow(/exited \(3\)/);
    session.kill();
  });

  test('malformed output from the server fails the request', async () => {
    const script = `process.stdin.once('data', () => process.stdout.write('Content-Length: nope\\r\\n\\r\\n'));`;
    const session = new StdioSession(['node', '-e', script], tmpdir(), tsserverProtocol, 5000);
    try {
      await expect(session.request('x', {})).rejects.toThrow(/Content-Length/);
    } finally {
      session.kill();
    }
  });
});

describe('edits', () => {
  const source = 'import x;\nexport const a = 1;\n';

  test('the valid edit appends one statement and puts the cursor inside the member name', () => {
    const edit = probeEdit(source, 'BenchModel0', 2, 'valid');

    expect(edit.text.startsWith(source)).toBe(true);
    expect(edit.text.slice(source.length)).toBe(
      'export const probe2 = client.db.BenchModel0.findMany({ select: { field0: true } });\n',
    );
    expect(edit.text.slice(0, edit.cursor).endsWith('BenchModel0.find')).toBe(true);
  });

  test('the error edit differs only by a number annotation, which cannot hold a query', () => {
    expect(probeEdit(source, 'M', 0, 'error').text).toContain('export const probe0: number = client.db.M.');
  });

  test('position is 0-based by line and character', () => {
    expect(position('ab\ncd\nef', 0)).toEqual({ line: 0, character: 0 });
    expect(position('ab\ncd\nef', 4)).toEqual({ line: 1, character: 1 });
    expect(position('ab\ncd\nef', 6)).toEqual({ line: 2, character: 0 });
  });
});

describe('arguments and output', () => {
  test('sizes default to 100 and 500, and --sizes overrides them', () => {
    expect(parseEditorArgs([]).sizes).toEqual([100, 500]);
    expect(parseEditorArgs(['--sizes', '10', '--runs', '2'])).toMatchObject({ sizes: [10], runs: 2 });
  });

  test('a row that was not measured prints its reason and no number', () => {
    const text = formatEditor({
      incremental: [],
      servers: [{ size: 100, server: '7.0.2 server', state: 'not measured', reason: 'no stdio server', timings: null }],
    });

    expect(text).toContain('not measured');
    expect(text).toContain('no stdio server');
    expect(text).not.toMatch(/7\.0\.2 server\s+\d/);
  });

  test('the output states the method', () => {
    const text = formatEditor({ incremental: [], servers: [] });

    expect(text).toContain('minus wall time of a run on the unchanged tree');
    expect(text).toContain('7.0.2 speaks LSP');
  });
});

withDist('against the real servers', () => {
  let root = '';
  let caseDir = '';

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'cerial-editor-test-'));
    const schemaDir = join(root, 'schema');
    mkdirSync(schemaDir);
    const schema = syntheticSchema({ models: 10, fieldsPerModel: 3, seed: 1 });
    writeFileSync(join(schemaDir, 'bench.cerial'), schema);
    const bench = {
      sizes: [],
      runs: 1,
      compilers: ['5.9' as const],
      fields: 3,
      json: null,
      ceiling: null,
      heapMb: 4096,
      case: null,
    };
    await measureCase(
      root,
      { name: 'editor test', size: 10, schemaDir, consumer: consumerSource(syntheticConsumerSpec(schema)) },
      bench,
      0,
    );
    caseDir = join(root, 'case-0');
  }, 180_000);

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test('tsserver resolves from the 5.9 alias', () => {
    expect(existsSync(tsserverPath())).toBe(true);
  });

  test('tsserver returns completions and no errors for a valid edit', async () => {
    const timings = await measureServer(caseDir, { kind: 'tsserver', runs: 2, edit: 'valid', timeoutMs: 90_000 });

    expect(timings.completions).toBeGreaterThan(0);
    expect(timings.diagnostics).toBe(0);
    expect(timings.completionMs).toBeGreaterThan(0);
  }, 120_000);

  test('tsserver reports an error for an edit that does not type-check', async () => {
    const timings = await measureServer(caseDir, { kind: 'tsserver', runs: 1, edit: 'error', timeoutMs: 90_000 });

    expect(timings.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  test('the 7.0.2 row is measured: it ships a language server over stdio', async () => {
    expect(await probeSevenServer()).toEqual({ state: 'measured', protocol: 'lsp' });
  }, 60_000);

  test('7.0.2 returns completions and no errors for a valid edit', async () => {
    const timings = await measureServer(caseDir, { kind: 'lsp', runs: 2, edit: 'valid', timeoutMs: 90_000 });

    expect(timings.completions).toBeGreaterThan(0);
    expect(timings.diagnostics).toBe(0);
  }, 120_000);

  test('7.0.2 reports an error for an edit that does not type-check', async () => {
    const timings = await measureServer(caseDir, { kind: 'lsp', runs: 1, edit: 'error', timeoutMs: 90_000 });

    expect(timings.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  test('the incremental re-check is separated from process start and leaves the consumer as it was', async () => {
    const before = await Bun.file(join(caseDir, 'consumer.ts')).text();
    const timings = await measureIncremental('5.9', caseDir, 'BenchModel0', 1);

    // Wall times of separate processes reorder under load; the compiler's own counts do not
    expect(timings.instantiations.noop).toBe(0);
    expect(timings.instantiations.edit).toBeGreaterThan(0);
    expect(timings.instantiations.cold).toBeGreaterThan(timings.instantiations.edit ?? Infinity);
    expect(timings.recheckMs).toBeCloseTo(Math.max(0, timings.editMs - timings.noopMs), 5);
    expect(await Bun.file(join(caseDir, 'consumer.ts')).text()).toBe(before);
  }, 120_000);
});
