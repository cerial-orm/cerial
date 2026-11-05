# Benchmark harness

Measures what a generated Cerial client costs a consumer: type-check time, type count, memory, output size, codegen time, editor latency, import cost and a few runtime costs. It is report-only. Nothing here asserts a threshold, and the numbers are meant to be compared between two deliberate runs on one machine.

Everything runs from `apps/orm`.

## Before any run

The harness generates a client with `dist/bin/cerial.mjs` and type-checks it against `dist/`, so a stale `dist/` measures old code. Build first, and again after every change under `src/`:

```bash
bun run build
```

A run refuses to start when `dist/index.d.mts` is older than the newest file under `src/`, and says so. Run on an idle machine: no test suite, no other build, no second bench. Wall-clock numbers taken next to a test run are not usable.

All work happens in a directory under the OS temp dir, removed at exit. Redirect `--json` output to the temp dir as well, never into the repo.

## Modes

| Command | Measures |
|---|---|
| `bun run bench` | The curve: for each size and compiler, check time, instantiations, types, memory, output size, file count, largest file and codegen time, plus the e2e corpus |
| `bun run bench -- --include-depth` | Include nesting at depths 1 to 4, forward and mixed |
| `bun run bench -- --editor` | `--noEmit --incremental` re-check after a one-line edit, and language-server open, completion and diagnostics |
| `bun run bench -- --runtime` | Import cost of the generated client in a fresh process, under Bun and under Node, and the per-access cost of the unknown-model guard |
| `bun run bench:live` | The extra latency of the nested-write existence check against the write it precedes |

The two compilers are TypeScript 5.9.3 and 7.0.2, installed as the `typescript-5.9` and `typescript-7` aliases in `devDependencies`. Each curve row is reported per compiler.

### Flags

Curve, and every mode except `bench:live`:

- `--sizes 10,100,500` model counts. Default `10,50,100,250,500,1000,1250,1500`
- `--runs 3` runs per size; the median is reported. Default 3
- `--compiler 5.9|7|all` default `all`
- `--fields 10` scalar fields per model. Default 10
- `--json path` also writes the raw rows as JSON
- `--heap-mb 4096` heap limit for 5.9 runs. Default 4096, so the ceiling is the same on every machine. 7 is native and has no such limit
- `--ceiling 1250` measure that one size and exit non-zero if any compiler runs out of heap there
- `--case name` apply a named transform to the generated tree first: `no-queries`, `no-select`, `flat-select`, `no-include`, `no-compute`, `dts`, `ts`, `barrel-models` and `barrel-root` (a consumer of one model from the `models/` barrel or the root barrel, checked alone), or one of the corpus-only select cases below. Each transform fails if its pattern matches nothing. `dts` measures the default layout and `ts` generates with `typeFiles: 'ts'`; both also report a `skipLibCheck: false` row, and each fails if the tree is not that layout

`heavy-select` replaces the corpus consumer with 200 queries that each select every field of `UnsetTest` (composites down to its three object levels, and its self-referencing tree) and read the result, so it measures a consumer where the selects dominate. It runs on the e2e corpus only and ignores `--sizes`. `heavy-select-no-resolve` and `heavy-select-no-arg` swap `ResolveFieldSelect` or `SelectArg` in the generated client for a trivial form, so the gap to `heavy-select` is that type's share of the check. Each has a `-ts` twin that generates with `typeFiles: 'ts'`; the plain name measures the default `.d.ts` layout.

Other modes:

- `--include-depth` takes `--depths 1,2,3,4` and `--size 50`
- `--editor` takes `--sizes` (default `100,500`) and the shared flags
- `--runtime` takes `--sizes` and `--runs` (processes per runtime, at least 5, default 5). Without `--sizes` it uses the curve's default sizes. The Node compile step runs `tsc --noCheck`, so it only emits JavaScript and does not run out of memory at 1000 models and above
- `bun run bench:live` takes `--iterations n` (default 100)

### Typical full baseline

```bash
bun run build
bun run bench -- --runs 3 --json "$TMPDIR/curve.json"
bun run bench -- --sizes 100,500 --fields 20 --json "$TMPDIR/fields20.json"
bun run bench -- --sizes 100,500 --fields 30 --json "$TMPDIR/fields30.json"
bun run bench -- --sizes 500 --case no-select
bun run bench -- --include-depth
bun run bench -- --editor
bun run bench -- --runtime
bun run bench:live
```

## Baseline

Current baseline, taken 2026-11-05 on darwin arm64 (24 GB), Bun 1.4.4, Node v24.18.0, at commit `2e6865b0`, by `bun run bench` with its default sizes: TypeScript 5.9.3 (`typescript-5.9`, under the 4096 MB pin) and TypeScript 7.0.2 (`typescript-7`). Check s / types / memory MB, default `.d.ts` layout, median of 3 runs:

| models | 5.9 | 7 |
|---|---|---|
| 100 | 0.190 / 22,348 / 274 | 0.029 / 28,108 / 170 |
| 500 | 0.500 / 86,910 / 864 | 0.126 / 107,212 / 547 |
| 1000 | 0.870 / 167,614 / 1,537 | 0.291 / 279,673 / 1,107 |
| 1500 | 1.240 / 248,318 / 2,229 | 0.407 / 303,952 / 1,489 |
| corpus (200) | 0.240 / 30,122 / 344 | 0.060 / 50,048 / 249 |

Every size to 1500 completes on 5.9 under the pin.

Previous baseline (2026-11-04, commit `0438b0a5`, same compilers 5.9.3 and 7.0.2), same columns:

| models | 5.9 | 7 |
|---|---|---|
| 100 | 0.210 / 21,824 / 262 | 0.036 / 27,515 / 152 |
| 500 | 0.490 / 86,386 / 699 | 0.133 / 106,619 / 456 |
| 1000 | 1.020 / 167,090 / 1,230 | 0.284 / 279,080 / 927 |
| corpus (200) | 0.220 / 27,774 / 326 | 0.057 / 46,209 / 218 |

Memory at 500 and 1000 models is 19 to 25 per cent above that run and output is 24 per cent larger; types and check times are within noise. Before the `.d.ts` layout, the `.ts` layout took 21.93 s and 3,930 MB on 5.9 at 1000 models.

## Requirements

- `bun run bench:live` needs SurrealDB on `http://127.0.0.1:8000` (`root`/`root`, namespace `main`). It makes its own database inside that instance and removes it afterwards. Nothing else here needs a database.
- The 7.0.2 editor row speaks LSP over `tsc --lsp --stdio`. If a future 7.x drops that server, the row says `not measured` and gives the reason rather than showing a number from something else.
- Node 24 or newer for the Node import row, and the `typescript-5.9` alias for its compile step.

## What is not comparable

- Numbers across machines. Time and memory depend on CPU, RAM and what else is running; compare two runs on one machine, with the same `dist/` build rules.
- Numbers across compilers. 5.9 and 7 count types and instantiations differently, so compare those within one compiler only. Check time and memory are fair between them as ratios.
- Numbers across schemas. The synthetic schema (models of scalar fields, an object, an optional tuple and a ring of relations) is deterministic for a given size, field count and seed, but it is not the e2e corpus, which has its own row. Results are valid against themselves, not against another harness.
- Runs with a different heap limit. A 5.9 ceiling only means something under one fixed `--heap-mb`.
- Single runs. Check time moves by around 15 per cent between invocations, so a gap under that needs the three-run median on both sides. Type counts and memory repeat to within about 1 per cent.
- `bench:live` against a different SurrealDB version or a non-memory backend.
- The unknown-model guard microbenchmark against the Bun version it ran on.
