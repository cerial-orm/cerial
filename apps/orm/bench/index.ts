import { writeFileSync } from 'node:fs';
import { formatCurve, parseBenchArgs, runBench } from './curve';

async function main(): Promise<void> {
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
