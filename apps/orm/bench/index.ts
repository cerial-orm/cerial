import { writeFileSync } from 'node:fs';
import { extractIncludeDepthArgs, formatIncludeDepth, runIncludeDepth } from './include-depth';
import { formatCurve, parseBenchArgs, runBench } from './curve';

/** `--include-depth [--depths 1,2,3,4] [--size 50]` plus the usual `--runs`, `--compiler`, `--fields`, `--json`, `--heap-mb` */
async function includeDepth(argv: readonly string[]): Promise<void> {
  const { depths, size, rest } = extractIncludeDepthArgs(argv);
  const bench = parseBenchArgs(rest);
  const rows = await runIncludeDepth({ depths, size, bench });
  console.log(formatIncludeDepth(rows));
  if (bench.json) writeFileSync(bench.json, `${JSON.stringify(rows, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--include-depth') return includeDepth(args.slice(1));

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
