import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type Subprocess } from 'bun';
import { type Compiler, compilerBin } from './compilers';
import { consumerSource, syntheticConsumerSpec } from './consumer';
import { assertDistFresh, type BenchOptions, measureCase, median, parseBenchArgs } from './curve';
import { syntheticSchema } from './schema';

export const DEFAULT_EDITOR_SIZES: readonly number[] = [100, 500];
const SEED = 1;
const PACKAGE_ROOT = join(import.meta.dir, '..');
const DEFAULT_TIMEOUT_MS = 120_000;
const TSC_COMMON = ['--noEmit', '--incremental', '--extendedDiagnostics'];

/** A framed message that cannot be parsed; the stream is unusable after it */
export class FrameError extends Error {}

/**
 * Splits a stdout stream of `Content-Length: n\r\n\r\n<n bytes of JSON>` frames, the framing of tsserver and of LSP.
 * `push` accepts chunks cut anywhere, including inside the header or a multi-byte character.
 */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Uint8Array): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    for (;;) {
      // tsserver ends each frame with a newline that may fall outside the counted bytes
      let start = 0;
      while (start < this.buffer.length && (this.buffer[start] === 0x0d || this.buffer[start] === 0x0a)) start++;
      if (start) this.buffer = this.buffer.subarray(start);

      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return messages;

      const header = this.buffer.subarray(0, headerEnd).toString('latin1');
      const match = /^content-length:[ \t]*(\d+)[ \t]*$/im.exec(header);
      if (!match)
        throw new FrameError(`frame header has no valid Content-Length: ${JSON.stringify(header.slice(0, 80))}`);

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return messages;

      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        messages.push(JSON.parse(body));
      } catch {
        throw new FrameError(`frame body is not JSON: ${JSON.stringify(body.slice(0, 80))}`);
      }
    }
  }
}

/** What a request resolves with, or why it failed */
export interface Reply {
  readonly id: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly error?: string;
}

/** How one server speaks: what to write for a request, and which incoming message answers which request */
export interface Protocol {
  encode(id: number, command: string, args: unknown): string;
  encodeNotification(id: number, command: string, args: unknown): string;
  /** The reply carried by `message`, or null for events and anything else not answering a request */
  reply(message: unknown): Reply | null;
  /** What to write back to a request the server makes of the client, or null */
  answerServerRequest(message: unknown): string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** tsserver: one JSON line per request, replies carry `request_seq` */
export const tsserverProtocol: Protocol = {
  encode: (id, command, args) => `${JSON.stringify({ seq: id, type: 'request', command, arguments: args })}\n`,
  encodeNotification: (id, command, args) => tsserverProtocol.encode(id, command, args),
  reply(message) {
    const value = record(message);
    if (!value || value.type !== 'response' || typeof value.request_seq !== 'number') return null;

    return {
      id: value.request_seq,
      ok: value.success === true,
      body: value.body,
      error: typeof value.message === 'string' ? value.message : undefined,
    };
  },
  answerServerRequest: () => null,
};

function lspFrame(payload: unknown): string {
  const json = JSON.stringify({ jsonrpc: '2.0', ...(payload as object) });

  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

/** LSP over stdio, which is what 7.x ships in place of tsserver */
export const lspProtocol: Protocol = {
  encode: (id, method, params) => lspFrame({ id, method, params }),
  encodeNotification: (_id, method, params) => lspFrame({ method, params }),
  reply(message) {
    const value = record(message);
    if (!value || typeof value.id !== 'number' || 'method' in value) return null;

    const error = record(value.error);

    return {
      id: value.id,
      ok: !error,
      body: value.result,
      error: error && typeof error.message === 'string' ? error.message : undefined,
    };
  },
  // Registration and configuration requests from the server need an answer or it waits on them
  answerServerRequest(message) {
    const value = record(message);
    if (!value || !('method' in value) || value.id === undefined) return null;

    return lspFrame({ id: value.id, result: null });
  },
};

interface Pending {
  readonly command: string;
  readonly resolve: (reply: Reply) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const live = new Set<StdioSession>();
process.on('exit', () => {
  for (const session of live) session.kill();
});

/** A child server over stdio: requests are matched to replies by id, and each has a timeout so a hung server fails the run */
export class StdioSession {
  private readonly proc: Subprocess<'pipe', 'pipe', 'pipe'>;
  private readonly parser = new FrameParser();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private failure: Error | null = null;

  constructor(
    command: readonly string[],
    cwd: string,
    private readonly protocol: Protocol,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    this.proc = Bun.spawn([...command], { cwd, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    live.add(this);
    void this.readLoop();
    void this.proc.exited.then((code) => this.fail(new Error(`server exited (${code}) with requests outstanding`)));
  }

  /** Sends a request and resolves with the matching reply's body; rejects on a failed reply, a timeout or a dead server */
  async request(command: string, args: unknown, timeoutMs: number = this.timeoutMs): Promise<unknown> {
    if (this.failure) throw this.failure;
    const id = this.nextId++;
    const reply = await new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { command, resolve, reject, timer });
      this.write(this.protocol.encode(id, command, args));
    });
    if (!reply.ok) throw new Error(`${command} failed: ${reply.error ?? 'no message'}`);

    return reply.body;
  }

  notify(command: string, args: unknown): void {
    this.write(this.protocol.encodeNotification(this.nextId++, command, args));
  }

  kill(): void {
    live.delete(this);
    this.proc.kill();
  }

  private write(text: string): void {
    this.proc.stdin.write(text);
    void this.proc.stdin.flush();
  }

  private fail(error: Error): void {
    this.failure ??= error;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const chunk of this.proc.stdout) {
        for (const message of this.parser.push(chunk)) this.dispatch(message);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private dispatch(message: unknown): void {
    const answer = this.protocol.answerServerRequest(message);
    if (answer) this.write(answer);

    const reply = this.protocol.reply(message);
    const pending = reply ? this.pending.get(reply.id) : undefined;
    if (!reply || !pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(reply.id);
    pending.resolve(reply);
  }
}

/** `lib/tsserver.js` of the 5.9 alias, next to the `bin/tsc` that `compilerBin` resolves through package.json */
export function tsserverPath(): string {
  return join(dirname(dirname(compilerBin('5.9'))), 'lib', 'tsserver.js');
}

/** The native executable the 7 alias launches; its `tsc` also serves LSP under `--lsp --stdio` */
export async function nativeServerBin(): Promise<string> {
  const manifest = Bun.fileURLToPath(import.meta.resolve('typescript-7/package.json'));
  const module = (await import(join(dirname(manifest), 'lib', 'getExePath.js'))) as { default: () => string };

  return module.default();
}

export type EditKind = 'valid' | 'error';

export interface ProbeEdit {
  /** The consumer after the edit */
  readonly text: string;
  /** Offset in `text` where completion is requested: inside the member name of the added line */
  readonly cursor: number;
}

/**
 * Appends one statement to `source`; `valid` type-checks, `error` assigns a query to a `number`. The cursor sits inside
 * `findMany`, a member completion on the model delegate. A cursor in the `select` object was tried and both servers
 * answered with the global scope, so it measures nothing about the generated types.
 */
export function probeEdit(source: string, model: string, index: number, kind: EditKind): ProbeEdit {
  const annotation = kind === 'error' ? ': number' : '';
  const head = `export const probe${index}${annotation} = client.db.${model}.find`;
  const text = `${source}${head}Many({ select: { field0: true } });\n`;

  return { text, cursor: source.length + head.length };
}

/** 0-based line and character of `offset` in `text` */
export function position(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length - 1;

  return { line, character: offset - (before.lastIndexOf('\n') + 1) };
}

export interface ServerTimings {
  readonly openMs: number;
  readonly completionMs: number;
  readonly diagnosticsMs: number;
  readonly completions: number;
  readonly diagnostics: number;
}

/** What differs between the two servers; the measurement around it is shared */
interface ServerAdapter {
  readonly protocol: Protocol;
  command(): Promise<string[]>;
  init(session: StdioSession, caseDir: string): Promise<void>;
  open(session: StdioSession, file: string, text: string): void;
  change(session: StdioSession, file: string, before: string, after: ProbeEdit): void;
  /** Replaces the whole text of an open file */
  replace(session: StdioSession, file: string, before: string, after: ProbeEdit): void;
  completions(session: StdioSession, file: string, edit: ProbeEdit): Promise<string[]>;
  diagnostics(session: StdioSession, file: string): Promise<number>;
}

function countOf(value: unknown, key: string | null): number {
  const list = key === null ? value : record(value)?.[key];

  return Array.isArray(list) ? list.length : 0;
}

function labelsOf(list: unknown, key: string): string[] {
  if (!Array.isArray(list)) return [];

  return list.map((item) => record(item)?.[key]).filter((label): label is string => typeof label === 'string');
}

const tsserverAdapter: ServerAdapter = {
  protocol: tsserverProtocol,
  command: async () => [
    'node',
    '--max-old-space-size=4096',
    tsserverPath(),
    '--disableAutomaticTypingAcquisition',
    '--suppressDiagnosticEvents',
    '--locale',
    'en',
  ],
  init: async () => {},
  open: (session, file, text) => {
    session.notify('open', { file, fileContent: text, scriptKindName: 'TS', projectRootPath: dirname(file) });
  },
  change(session, file, before, after) {
    const at = position(after.text, before.length);
    session.notify('change', {
      file,
      line: at.line + 1,
      offset: at.character + 1,
      endLine: at.line + 1,
      endOffset: at.character + 1,
      insertString: after.text.slice(before.length),
    });
  },
  replace(session, file, before, after) {
    const end = position(before, before.length);
    session.notify('change', {
      file,
      line: 1,
      offset: 1,
      endLine: end.line + 1,
      endOffset: end.character + 1,
      insertString: after.text,
    });
  },
  async completions(session, file, edit) {
    const at = position(edit.text, edit.cursor);
    const body = await session.request('completionInfo', { file, line: at.line + 1, offset: at.character + 1 });

    return labelsOf(record(body)?.entries, 'name');
  },
  async diagnostics(session, file) {
    return countOf(await session.request('semanticDiagnosticsSync', { file }), null);
  },
};

const lspVersions = new Map<string, number>();

const lspAdapter: ServerAdapter = {
  protocol: lspProtocol,
  command: async () => [await nativeServerBin(), '--lsp', '--stdio'],
  async init(session, caseDir) {
    await session.request('initialize', {
      processId: process.pid,
      rootUri: Bun.pathToFileURL(caseDir).href,
      capabilities: {},
    });
    session.notify('initialized', {});
  },
  open(session, file, text) {
    lspVersions.set(file, 1);
    session.notify('textDocument/didOpen', {
      textDocument: { uri: Bun.pathToFileURL(file).href, languageId: 'typescript', version: 1, text },
    });
  },
  change(session, file, _before, after) {
    const version = (lspVersions.get(file) ?? 1) + 1;
    lspVersions.set(file, version);
    session.notify('textDocument/didChange', {
      textDocument: { uri: Bun.pathToFileURL(file).href, version },
      contentChanges: [{ text: after.text }],
    });
  },
  replace(session, file, before, after) {
    lspAdapter.change(session, file, before, after);
  },
  async completions(session, file, edit) {
    const body = await session.request('textDocument/completion', {
      textDocument: { uri: Bun.pathToFileURL(file).href },
      position: position(edit.text, edit.cursor),
    });

    return labelsOf(Array.isArray(body) ? body : record(body)?.items, 'label');
  },
  async diagnostics(session, file) {
    const body = await session.request('textDocument/diagnostic', {
      textDocument: { uri: Bun.pathToFileURL(file).href },
    });

    const items = record(body)?.items;

    // Severity 1 is an error; the server also reports hints such as deprecation, which tsserver keeps out of semantic diagnostics
    return Array.isArray(items) ? items.filter((item) => record(item)?.severity === 1).length : 0;
  },
};

export type ServerKind = 'tsserver' | 'lsp';

export interface ServerOptions {
  readonly kind: ServerKind;
  readonly runs: number;
  readonly edit: EditKind;
  readonly timeoutMs?: number;
}

/**
 * Opens `consumer.ts` of `caseDir` in the server and times the first diagnostics (open), then for each run appends a
 * statement and times completion and diagnostics. The first request after an edit pays for updating the program, which
 * is what a keystroke costs; completion is asked first, as an editor does. Medians are over `runs`.
 */
export async function measureServer(caseDir: string, options: ServerOptions): Promise<ServerTimings> {
  const adapter = options.kind === 'tsserver' ? tsserverAdapter : lspAdapter;
  const file = join(caseDir, 'consumer.ts');
  const source = await Bun.file(file).text();
  const model = /client\.db\.(\w+)\./.exec(source)?.[1];
  if (!model) throw new Error('consumer.ts has no client.db.<Model> query to edit');

  const session = new StdioSession(await adapter.command(), caseDir, adapter.protocol, options.timeoutMs);
  try {
    await adapter.init(session, caseDir);

    let started = performance.now();
    adapter.open(session, file, source);
    await adapter.diagnostics(session, file);
    const openMs = performance.now() - started;

    const completionMs: number[] = [];
    const diagnosticsMs: number[] = [];
    let text = source;
    let completions = 0;
    let diagnostics = 0;

    for (let run = 0; run < options.runs; run++) {
      const edit = probeEdit(text, model, run, options.edit);
      adapter.change(session, file, text, edit);
      text = edit.text;

      started = performance.now();
      completions = (await adapter.completions(session, file, edit)).length;
      completionMs.push(performance.now() - started);

      started = performance.now();
      diagnostics = await adapter.diagnostics(session, file);
      diagnosticsMs.push(performance.now() - started);
    }

    return {
      openMs,
      completionMs: median(completionMs),
      diagnosticsMs: median(diagnosticsMs),
      completions,
      diagnostics,
    };
  } finally {
    session.kill();
  }
}

/** The 7 row is a measurement, or the reason there is none; never a number from another tool */
export type SevenServer =
  | { readonly state: 'measured'; readonly protocol: 'lsp' }
  | { readonly state: 'not measured'; readonly reason: string };

/** Starts the 7 binary as a language server and waits for its `initialize` answer */
export async function probeSevenServer(timeoutMs = 20_000): Promise<SevenServer> {
  let session: StdioSession | null = null;
  try {
    session = new StdioSession(await lspAdapter.command(), tmpdir(), lspProtocol, timeoutMs);
    await session.request('initialize', { processId: process.pid, rootUri: null, capabilities: {} });

    return { state: 'measured', protocol: 'lsp' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return { state: 'not measured', reason: `7.0.2 gave no language server over stdio (${reason})` };
  } finally {
    session?.kill();
  }
}

export interface IncrementalTimings {
  readonly coldMs: number;
  /** Process time with nothing changed: start, config, build info load and the up-to-date test */
  readonly noopMs: number;
  /** Process time after a one-line consumer edit */
  readonly editMs: number;
  /** `editMs - noopMs`: the re-check, separated from process start */
  readonly recheckMs: number;
  /** `Check time` the compiler itself reports for the edited run */
  readonly editCheckSeconds: number | null;
}

async function timedTsc(
  compiler: Compiler,
  caseDir: string,
  infoFile: string,
): Promise<{ ms: number; stdout: string }> {
  const heap = compiler === '5.9' ? ['--max-old-space-size=4096'] : [];
  const started = performance.now();
  const proc = Bun.spawn(
    ['node', ...heap, compilerBin(compiler), '-p', caseDir, ...TSC_COMMON, '--tsBuildInfoFile', infoFile],
    {
      cwd: caseDir,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const ms = performance.now() - started;
  if (exitCode !== 0)
    throw new Error(`tsc ${compiler} --incremental exited ${exitCode}: ${(stdout || stderr).slice(0, 400)}`);

  return { ms, stdout };
}

/**
 * `--noEmit --incremental`: one cold build writes the build info; then each run appends a statement to the consumer and
 * re-checks (edit), and a second run on the unchanged tree (no-op) gives the process cost to subtract.
 */
export async function measureIncremental(
  compiler: Compiler,
  caseDir: string,
  model: string,
  runs: number,
): Promise<IncrementalTimings> {
  const file = join(caseDir, 'consumer.ts');
  const infoFile = join(caseDir, `editor-${compiler}.tsbuildinfo`);
  const original = await Bun.file(file).text();
  let text = original;

  const cold = await timedTsc(compiler, caseDir, infoFile);
  const edits: number[] = [];
  const noops: number[] = [];
  const checks: number[] = [];

  // The next compiler and the servers start from the consumer as generated
  try {
    for (let run = 0; run < runs; run++) {
      text = probeEdit(text, model, run, 'valid').text;
      writeFileSync(file, text);

      const edit = await timedTsc(compiler, caseDir, infoFile);
      edits.push(edit.ms);
      const check = /^Check time:\s+([\d.]+)s/m.exec(edit.stdout);
      if (check) checks.push(Number(check[1]));
      noops.push((await timedTsc(compiler, caseDir, infoFile)).ms);
    }
  } finally {
    writeFileSync(file, original);
  }

  const editMs = median(edits);
  const noopMs = median(noops);

  return {
    coldMs: cold.ms,
    noopMs,
    editMs,
    recheckMs: Math.max(0, editMs - noopMs),
    editCheckSeconds: checks.length ? median(checks) : null,
  };
}

export interface IncrementalRow extends IncrementalTimings {
  readonly size: number;
  readonly compiler: Compiler;
}

export interface ServerRow {
  readonly size: number;
  readonly server: string;
  readonly state: 'measured' | 'not measured';
  readonly reason?: string;
  readonly timings: ServerTimings | null;
}

export interface EditorResult {
  readonly incremental: readonly IncrementalRow[];
  readonly servers: readonly ServerRow[];
}

export interface EditorOptions {
  /** Sizes, runs and fields; compilers choose which incremental rows exist */
  readonly bench: BenchOptions;
  readonly timeoutMs?: number;
}

/** `--editor` takes the usual flags; sizes default to 100 and 500 */
export function parseEditorArgs(argv: readonly string[]): BenchOptions {
  return parseBenchArgs(argv.includes('--sizes') ? argv : ['--sizes', DEFAULT_EDITOR_SIZES.join(','), ...argv]);
}

/** Generates each size once, then measures the incremental re-check per compiler and both language servers */
export async function runEditor(options: EditorOptions, allowStale = false): Promise<EditorResult> {
  if (!allowStale) assertDistFresh(join(PACKAGE_ROOT, 'dist', 'index.d.mts'), join(PACKAGE_ROOT, 'src'));

  const root = mkdtempSync(join(tmpdir(), 'cerial-bench-editor-'));
  const cleanup = (): void => rmSync(root, { recursive: true, force: true });
  process.on('exit', cleanup);

  try {
    const sevenServer = options.bench.compilers.includes('7') ? await probeSevenServer() : null;
    const incremental: IncrementalRow[] = [];
    const servers: ServerRow[] = [];
    let index = 0;

    for (const size of options.bench.sizes) {
      const schemaDir = join(root, `schema-${size}`);
      mkdirSync(schemaDir, { recursive: true });
      const schema = syntheticSchema({ models: size, fieldsPerModel: options.bench.fields, seed: SEED });
      writeFileSync(join(schemaDir, 'bench.cerial'), schema);
      const spec = syntheticConsumerSpec(schema);

      // One cold check through the shared case setup proves the consumer compiles before anything is timed
      const setup = { ...options.bench, runs: 1, compilers: ['5.9'] as Compiler[], case: null };
      await measureCase(
        root,
        { name: `editor ${size}`, size, schemaDir, consumer: consumerSource(spec) },
        setup,
        index,
      );
      const caseDir = join(root, `case-${index++}`);

      for (const compiler of options.bench.compilers) {
        const timings = await measureIncremental(compiler, caseDir, spec.model, options.bench.runs);
        incremental.push({ size, compiler, ...timings });
      }

      if (options.bench.compilers.includes('5.9')) {
        const timings = await measureServer(caseDir, {
          kind: 'tsserver',
          runs: options.bench.runs,
          edit: 'valid',
          timeoutMs: options.timeoutMs,
        });
        servers.push({ size, server: '5.9.3 tsserver', state: 'measured', timings });
      }
      if (sevenServer?.state === 'measured') {
        const timings = await measureServer(caseDir, {
          kind: 'lsp',
          runs: options.bench.runs,
          edit: 'valid',
          timeoutMs: options.timeoutMs,
        });
        servers.push({ size, server: '7.0.2 LSP', state: 'measured', timings });
      } else if (sevenServer) {
        servers.push({
          size,
          server: '7.0.2 server',
          state: 'not measured',
          reason: sevenServer.reason,
          timings: null,
        });
      }
    }

    return { incremental, servers };
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
}

function table(header: string[], body: string[][]): string {
  const widths = header.map((title, col) => Math.max(title.length, ...body.map((line) => line[col]!.length)));
  const render = (line: string[]): string =>
    line
      .map((cell, col) => cell.padEnd(widths[col]!))
      .join('  ')
      .trimEnd();

  return [render(header), ...body.map(render)].join('\n');
}

const ms = (value: number): string => value.toFixed(0);

/** Two tables; the method is printed with them so a number is never read as something it is not */
export function formatEditor(result: EditorResult): string {
  const incremental = table(
    ['models', 'compiler', 'cold (ms)', 'no-op (ms)', 'edit (ms)', 're-check (ms)', 'check time (s)'],
    result.incremental.map((row) => [
      String(row.size),
      row.compiler,
      ms(row.coldMs),
      ms(row.noopMs),
      ms(row.editMs),
      ms(row.recheckMs),
      row.editCheckSeconds === null ? '-' : row.editCheckSeconds.toFixed(2),
    ]),
  );
  const servers = table(
    ['models', 'server', 'open (ms)', 'completion (ms)', 'diagnostics (ms)', 'completions', 'errors'],
    result.servers.map((row) =>
      row.timings
        ? [
            String(row.size),
            row.server,
            ms(row.timings.openMs),
            ms(row.timings.completionMs),
            ms(row.timings.diagnosticsMs),
            String(row.timings.completions),
            String(row.timings.diagnostics),
          ]
        : [String(row.size), row.server, 'not measured', '-', '-', '-', row.reason ?? ''],
    ),
  );

  return [
    "--noEmit --incremental: re-check = wall time of a run after a one-line consumer edit minus wall time of a run on the unchanged tree (process start, config and build info load); check time is the compiler's own figure for the edited run. Medians.",
    incremental,
    '',
    'Language server: open = first diagnostics for the opened consumer; completion and diagnostics are timed after an appended statement (completion first, so it pays for the program update). 5.9.3 speaks tsserver, 7.0.2 speaks LSP over `tsc --lsp --stdio`. Medians.',
    servers,
  ].join('\n');
}

/**
 * Completion labels at the `|` in `text`, as an editor would offer them. Each call replaces the whole of `consumer.ts` in
 * the server, so one session serves several probes over the same generated tree.
 */
export class CompletionProbe {
  private readonly adapter: ServerAdapter;
  private readonly session: Promise<StdioSession>;
  private readonly file: string;
  private current: string | null = null;

  constructor(
    private readonly caseDir: string,
    kind: ServerKind,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    this.adapter = kind === 'tsserver' ? tsserverAdapter : lspAdapter;
    this.file = join(caseDir, 'consumer.ts');
    this.session = this.start();
  }

  private async start(): Promise<StdioSession> {
    const session = new StdioSession(await this.adapter.command(), this.caseDir, this.adapter.protocol, this.timeoutMs);
    await this.adapter.init(session, this.caseDir);

    return session;
  }

  async labels(textWithCursor: string): Promise<string[]> {
    const cursor = textWithCursor.indexOf('|');
    if (cursor === -1) throw new Error('probe text has no | cursor');
    const text = textWithCursor.slice(0, cursor) + textWithCursor.slice(cursor + 1);
    const edit: ProbeEdit = { text, cursor };
    const session = await this.session;

    if (this.current === null) {
      this.adapter.open(session, this.file, text);
    } else {
      this.adapter.replace(session, this.file, this.current, edit);
    }
    this.current = text;
    // Both servers load the project and apply the edit on the first request that needs types
    await this.adapter.diagnostics(session, this.file);

    return this.adapter.completions(session, this.file, edit);
  }

  async close(): Promise<void> {
    (await this.session).kill();
  }
}
