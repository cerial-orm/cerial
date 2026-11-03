import { writeFileSync } from 'node:fs';
import { extractIncludeDepthArgs, formatIncludeDepth, runIncludeDepth } from './include-depth';
import { formatEditor, parseEditorArgs, runEditor } from './editor';
import { formatRuntime, runRuntime } from './runtime';
import { formatCurve, parseBenchArgs, runBench } from './curve';

/** `--include-depth [--depths 1,2,3,4] [--size 50]` plus the usual `--runs`, `--compiler`, `--fields`, `--json`, `--heap-mb` */
async function includeDepth(argv: readonly string[]): Promise<void> {
  const { depths, size, rest } = extractIncludeDepthArgs(argv);
  const bench = parseBenchArgs(rest);
  const rows = await runIncludeDepth({ depths, size, bench });
  console.log(formatIncludeDepth(rows));
  if (bench.json) writeFileSync(bench.json, `${JSON.stringify(rows, null, 2)}\n`);
}

/** `--editor [--sizes 100,500]` plus the usual `--runs`, `--compiler`, `--fields`, `--json`, `--heap-mb` */
async function editor(argv: readonly string[]): Promise<void> {
  const bench = parseEditorArgs(argv);
  const result = await runEditor({ bench });
  console.log(formatEditor(result));
  if (bench.json) writeFileSync(bench.json, `${JSON.stringify(result, null, 2)}\n`);
}

/** `--runtime [--sizes 10,100]` plus the usual `--runs` (processes per runtime, at least 5; default 5), `--fields`, `--json` */
async function runtime(argv: readonly string[]): Promise<void> {
  const bench = parseBenchArgs(argv);
  const result = await runRuntime({ bench, processes: argv.includes('--runs') ? bench.runs : 5 });
  console.log(formatRuntime(result));
  if (bench.json) writeFileSync(bench.json, `${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--include-depth') return includeDepth(args.slice(1));

  if (args[0] === '--runtime') return runtime(args.slice(1));

  if (args[0] === '--editor') return editor(args.slice(1));

  const options = parseBenchArgs(process.argv.slice(2));
  const { rows, failures } = await runBench(options);
  console.log(formatCurve(rows));
  if (options.json) writeFileSync(options.json, `${JSON.stringify(rows, null, 2)}\n`);

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

// A signal exits through the handlers `runBench` registered, which remove its temp directory
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
