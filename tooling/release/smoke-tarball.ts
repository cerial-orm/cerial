// The consumer smoke: pack the package the way a publish would and use the tarball as a stranger would.
//
//   bun run tooling/release/smoke-tarball.ts <package-dir> [--allow-dirty]
//
// It refuses a package directory with uncommitted changes, builds (`prepublishOnly` does not run on `npm pack`),
// packs into a temporary directory and installs that tarball into new projects outside the workspace. Nothing is
// published and nothing is written to a registry; installing the tarball reads the registry for its dependencies.
// `--allow-dirty` is for trying the smoke on a work tree, never for the release run.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { withoutGit } from '../hooks/scratch.ts';

export interface Ran {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const ALLOWED_TOP = new Set(['package/package.json', 'package/README.md', 'package/LICENSE']);
const RESOLUTIONS = ['nodenext', 'node16'] as const;
/** The module systems a consumer's package.json can declare; the generated output must typecheck under both. */
export const CONSUMER_TYPES = ['commonjs', 'module'] as const;

function run(command: string, args: string[], cwd: string): Ran {
  const proc = Bun.spawnSync([command, ...args], { cwd, env: withoutGit(), stdout: 'pipe', stderr: 'pipe' });

  return { status: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/** A violation line when the package directory has uncommitted or untracked changes. */
export function dirtyViolation(packageDir: string): string | undefined {
  const status = run('git', ['status', '--porcelain', '--', '.'], packageDir);
  if (status.status !== 0) return `git status failed in ${packageDir}: ${status.stderr.trim()}`;
  const lines = status.stdout.split('\n').filter(Boolean);
  if (!lines.length) return undefined;

  return `${packageDir} has uncommitted changes (${lines.length}); the smoke packs what is committed: ${lines.slice(0, 5).join('; ')}`;
}

/** Every path in the tarball must be package.json, README.md, LICENSE or under dist/. */
export function disallowedFiles(paths: readonly string[]): string[] {
  return paths
    .filter((path) => !path.endsWith('/') && !ALLOWED_TOP.has(path) && !path.startsWith('package/dist/'))
    .map((path) => `tarball carries ${path}, which is outside dist, README.md, LICENSE and package.json`);
}

/** Absolute local paths named by a source map's `sources`, or by a root that is the machine's own. */
export function mapLeaks(path: string, text: string, localRoots: readonly string[]): string[] {
  let map: { sources?: unknown; sourceRoot?: unknown };
  try {
    map = JSON.parse(text);
  } catch {
    return [`${path} is not valid JSON`];
  }
  const named = [...(Array.isArray(map.sources) ? map.sources : []), map.sourceRoot].filter(
    (entry): entry is string => typeof entry === 'string' && !!entry,
  );
  const leaks = named.filter(
    (entry) => isAbsolute(entry) || /^[a-zA-Z]:[\\/]/.test(entry) || localRoots.some((root) => entry.includes(root)),
  );

  return leaks.map((entry) => `${path} names the absolute local path ${entry}`);
}

/** Every `exports` subpath as an import specifier: `cerial`, `cerial/schema`, and so on. */
export function exportSpecifiers(pkg: PackageJson): string[] {
  return Object.keys(pkg.exports ?? {})
    .filter((key) => key === '.' || key.startsWith('./'))
    .map((key) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`));
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

class Smoke {
  readonly violations: string[] = [];
  checks = 0;

  expect(ok: boolean, message: string, detail = ''): void {
    this.checks++;
    if (!ok) this.violations.push(detail ? `${message}: ${detail.trim().slice(0, 600)}` : message);
  }
}

const STACK = /\n\s+at\s/;

const USER_CERIAL = `model User {
  id Record @id
  name String
  posts Relation[] @model(Post)
}
`;
const POST_CERIAL = `model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(User)
}
`;
const USER_MODULE = `import { f, model } from 'cerial/schema';

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
});
`;
const POST_MODULE = `import { f, model } from 'cerial/schema';
import { User } from './user.schema';

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  author: f.relation(() => User).optional(),
});
`;
// Reaches a model declared in a .cerial file through the generated handles, which import `cerial/schema`
const ORDER_MODULE = `import { f, model } from 'cerial/schema';
import { Customer } from './cerial/handles.js';

export const Purchase = model('Purchase', {
  id: f.record('int').id(),
  customer: f.relation(Customer),
});
`;
const CUSTOMER_CERIAL = `model Customer {
  id Record(int) @id
  orders Relation[] @model(Purchase)
}
`;
const CONFIG = "export default { schema: './schemas', output: './out' };\n";

interface Runtime {
  readonly name: string;
  readonly binary: string;
}

function consumer(
  root: string,
  name: string,
  files: Record<string, string>,
  type: 'module' | 'commonjs' = 'module',
): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, private: true, type }));
  for (const [file, text] of Object.entries({ 'cerial.config.ts': CONFIG, ...files })) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }

  return dir;
}

function install(dir: string, tarball: string, extra: string[]): Ran {
  return run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball, ...extra], dir);
}

function listed(dir: string): string[] {
  return existsSync(dir) ? walk(dir).map((file) => file.slice(dir.length + 1)) : [];
}

function smokeExports(smoke: Smoke, dir: string, runtime: Runtime, specifiers: readonly string[]): void {
  const esm = runtime.name === 'bun' ? ['-e'] : ['--input-type=module', '-e'];
  for (const specifier of specifiers) {
    const imported = run(runtime.binary, [...esm, `await import(${JSON.stringify(specifier)})`], dir);
    smoke.expect(
      imported.status === 0 && !imported.stderr.trim(),
      `${runtime.name} import ${specifier}`,
      imported.stderr,
    );
    const required = run(runtime.binary, ['-e', `require(${JSON.stringify(specifier)})`], dir);
    smoke.expect(
      required.status === 0 && !required.stderr.trim(),
      `${runtime.name} require ${specifier}`,
      required.stderr,
    );
  }
}

function cli(runtime: Runtime, dir: string, args: string[]): Ran {
  return run(runtime.binary, [join(dir, 'node_modules/cerial/dist/bin/cerial.mjs'), ...args], dir);
}

function smokeGenerate(smoke: Smoke, root: string, tarball: string, runtime: Runtime, peer: string[]): void {
  const projects: Record<string, Record<string, string>> = {
    cerial: { 'schemas/user.cerial': USER_CERIAL, 'schemas/post.cerial': POST_CERIAL },
    typescript: { 'schemas/user.schema.ts': USER_MODULE, 'schemas/post.schema.ts': POST_MODULE },
    mixed: { 'schemas/customer.cerial': CUSTOMER_CERIAL, 'schemas/order.schema.ts': ORDER_MODULE },
  };
  for (const [kind, files] of Object.entries(projects)) {
    const label = `${runtime.name} generate (${kind} project)`;
    const dir = consumer(root, `${runtime.name}-${kind}`, files);
    const installed = install(dir, tarball, peer);
    smoke.expect(installed.status === 0, `${label}: npm install`, installed.stderr);
    if (installed.status) continue;
    const generated = cli(runtime, dir, ['generate', '-y']);
    smoke.expect(generated.status === 0, label, generated.stdout + generated.stderr);
    smoke.expect(
      listed(join(dir, 'out')).some((file) => file.endsWith('.ts')),
      `${label} wrote no client files`,
    );
    if (kind === 'mixed') {
      smoke.expect(existsSync(join(dir, 'schemas/cerial/handles.ts')), `${label} wrote no cerial/handles.ts`);
    }
  }
}

function smokeConvert(smoke: Smoke, root: string, tarball: string, runtime: Runtime, peer: string[]): void {
  const label = `${runtime.name} convert`;
  const dir = consumer(root, `${runtime.name}-convert`, {
    'schemas/user.cerial': USER_CERIAL,
    'schemas/post.cerial': POST_CERIAL,
  });
  const installed = install(dir, tarball, peer);
  smoke.expect(installed.status === 0, `${label}: npm install`, installed.stderr);
  if (installed.status) return;
  const names = (): string => readdirSync(join(dir, 'schemas')).sort().join(',');
  const toTs = cli(runtime, dir, ['convert', '--to', 'ts', '--remove-source']);
  smoke.expect(toTs.status === 0, `${label} --to ts`, toTs.stdout + toTs.stderr);
  smoke.expect(names() === 'post.schema.ts,user.schema.ts', `${label} --to ts left ${names()}`);
  const toCerial = cli(runtime, dir, ['convert', '--to', 'cerial', '--remove-source']);
  smoke.expect(toCerial.status === 0, `${label} --to cerial`, toCerial.stdout + toCerial.stderr);
  smoke.expect(names() === 'post.cerial,user.cerial', `${label} --to cerial left ${names()}`);

  // Without the peer, the failure is a message and not a stack
  const bare = consumer(root, `${runtime.name}-no-peer`, { 'schemas/user.schema.ts': USER_MODULE });
  const noPeer = install(bare, tarball, ['--legacy-peer-deps']);
  smoke.expect(noPeer.status === 0, `${label} without the peer: npm install`, noPeer.stderr);
  if (noPeer.status) return;
  smoke.expect(
    !existsSync(join(bare, 'node_modules/typescript')),
    `${label} without the peer still installed typescript`,
  );
  const refused = cli(runtime, bare, ['convert', '--to', 'cerial']);
  const output = refused.stdout + refused.stderr;
  smoke.expect(refused.status === 1, `${label} without the peer exits 1`, `exit ${refused.status}: ${output}`);
  smoke.expect(/typescript/i.test(output), `${label} without the peer does not name the typescript package`, output);
  smoke.expect(!STACK.test(output), `${label} without the peer prints a stack`, output);
}

function smokeHelp(smoke: Smoke, dir: string, runtime: Runtime): void {
  for (const args of [['--help'], ['migrate', '--help']]) {
    const help = cli(runtime, dir, args);
    smoke.expect(
      help.status === 0 && /cerial|migrate/i.test(help.stdout + help.stderr),
      `${runtime.name} cerial ${args.join(' ')}`,
      help.stderr,
    );
  }
}

/** The generated output, typechecked under both Node resolution modes, as a CommonJS and as an ES module consumer. */
function smokeTypes(smoke: Smoke, root: string, tarball: string, peer: string[]): void {
  for (const resolution of RESOLUTIONS) {
    for (const type of CONSUMER_TYPES) {
      const label = `tsc ${resolution} (${type} consumer)`;
      const dir = consumer(
        root,
        `types-${resolution}-${type}`,
        {
          'schemas/customer.cerial': CUSTOMER_CERIAL,
          'schemas/order.schema.ts': ORDER_MODULE,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              module: resolution,
              moduleResolution: resolution,
              target: 'es2022',
              strict: true,
              skipLibCheck: true,
              noEmit: true,
            },
            include: ['out/**/*.ts', 'schemas/**/*.ts'],
          }),
        },
        type,
      );
      const installed = install(dir, tarball, peer);
      smoke.expect(installed.status === 0, `${label}: npm install`, installed.stderr);
      if (installed.status) continue;
      const generated = run(
        process.execPath,
        [join(dir, 'node_modules/cerial/dist/bin/cerial.mjs'), 'generate', '-y'],
        dir,
      );
      smoke.expect(generated.status === 0, `${label}: generate`, generated.stdout + generated.stderr);
      if (generated.status) continue;
      const checked = run(process.execPath, [join(dir, 'node_modules/typescript/bin/tsc'), '-p', '.'], dir);
      smoke.expect(checked.status === 0, label, checked.stdout + checked.stderr);
    }
  }
}

export interface SmokeOptions {
  readonly packageDir: string;
  readonly allowDirty?: boolean;
}

export function smokeTarball({ packageDir, allowDirty = false }: SmokeOptions): {
  violations: string[];
  checks: number;
} {
  const smoke = new Smoke();
  const dir = realpathSync(resolve(packageDir));
  if (!allowDirty) {
    const dirty = dirtyViolation(dir);
    if (dirty) return { violations: [dirty], checks: 1 };
  }
  const pkg: PackageJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const built = run('bun', ['run', 'build'], dir);
  if (built.status)
    return { violations: [`bun run build failed: ${(built.stdout + built.stderr).slice(-600)}`], checks: 1 };

  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cerial-smoke-')));
  try {
    const packed = join(root, 'pack');
    mkdirSync(packed);
    const pack = run('npm', ['pack', '--pack-destination', packed, '--loglevel=error'], dir);
    const tarballs = readdirSync(packed).filter((file) => file.endsWith('.tgz'));
    if (pack.status || tarballs.length !== 1) {
      return { violations: [`npm pack failed: ${pack.stderr.trim()}`], checks: 1 };
    }
    const tarball = join(packed, tarballs[0]!);

    const unpacked = join(root, 'unpacked');
    mkdirSync(unpacked);
    const extract = run('tar', ['-xzf', tarball, '-C', unpacked], root);
    smoke.expect(extract.status === 0, 'tar could not read the tarball', extract.stderr);
    const files = listed(unpacked).map((file) => file);
    smoke.violations.push(...disallowedFiles(files));
    const roots = [dir, resolve(dir, '../..')];
    for (const file of files.filter((name) => name.endsWith('.map'))) {
      smoke.violations.push(...mapLeaks(file, readFileSync(join(unpacked, file), 'utf8'), roots));
    }
    smoke.checks += files.length;

    const typescript = `typescript@${(pkg.peerDependencies?.typescript ?? '').replace(/^[^\d]*/, '') || 'latest'}`;
    const peer = [typescript];
    const runtimes: Runtime[] = [
      { name: 'node', binary: 'node' },
      { name: 'bun', binary: process.execPath },
    ];
    for (const runtime of runtimes) {
      const dirFor = consumer(root, `${runtime.name}-exports`, {});
      const installed = install(dirFor, tarball, peer);
      smoke.expect(installed.status === 0, `${runtime.name} exports: npm install`, installed.stderr);
      if (!installed.status) {
        smokeExports(smoke, dirFor, runtime, exportSpecifiers(pkg));
        smokeHelp(smoke, dirFor, runtime);
      }
      smokeGenerate(smoke, root, tarball, runtime, peer);
      smokeConvert(smoke, root, tarball, runtime, peer);
    }
    smokeTypes(smoke, root, tarball, peer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  return { violations: smoke.violations, checks: smoke.checks };
}

function main(): void {
  const args = process.argv.slice(2);
  const packageDir = args.find((arg) => !arg.startsWith('--'));
  if (!packageDir || !existsSync(join(packageDir, 'package.json'))) {
    process.stderr.write('usage: smoke-tarball.ts <package-dir> [--allow-dirty]\n');
    process.exit(2);
  }
  const { violations, checks } = smokeTarball({ packageDir, allowDirty: args.includes('--allow-dirty') });
  for (const line of violations) process.stdout.write(`${line}\n`);
  if (!violations.length) process.stdout.write(`smoke ok: ${checks} checks\n`);
  process.exit(violations.length ? 1 : 0);
}

if (import.meta.main) main();
