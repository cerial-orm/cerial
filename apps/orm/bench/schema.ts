export interface SyntheticSchemaOptions {
  /** Number of models, at least 3 so the ring's forward and reverse relations never meet the same model twice */
  readonly models: number;
  /** Number of scalar fields on each model, at least 1 */
  readonly fieldsPerModel: number;
  /** Selects the scalar types of each model; the same seed always gives the same text */
  readonly seed: number;
}

const SCALAR_TYPES = ['String', 'Int', 'Float', 'Bool', 'Date'] as const;

/** One object type per this many models */
const MODELS_PER_OBJECT = 10;

/** Small seeded generator, so variation depends on the seed alone */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function requireInteger(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer of at least ${min}, got ${value}`);
  }
}

/**
 * Deterministic `.cerial` text for benchmarking: N models in a ring (model i points at model i + 1), each with
 * scalars, an object holding a nested object, an optional tuple, a forward relation and its reverse.
 */
export function syntheticSchema(options: SyntheticSchemaOptions): string {
  const { models, fieldsPerModel, seed } = options;
  requireInteger('models', models, 3);
  requireInteger('fieldsPerModel', fieldsPerModel, 1);
  requireInteger('seed', seed, Number.MIN_SAFE_INTEGER);

  const next = mulberry32(seed);
  const objectCount = Math.max(1, Math.floor(models / MODELS_PER_OBJECT));
  const blocks: string[] = ['tuple BenchPoint {\n  lat Float,\n  lng Float\n}'];

  for (let k = 0; k < objectCount; k++) {
    blocks.push(`object BenchDetail${k} {\n  note String\n  weight Int\n}`);
    blocks.push(`object BenchProfile${k} {\n  label String\n  rank Int\n  detail BenchDetail${k}\n}`);
  }

  for (let i = 0; i < models; i++) {
    const lines = ['  id Record @id'];

    for (let f = 0; f < fieldsPerModel; f++) {
      const type = SCALAR_TYPES[Math.floor(next() * SCALAR_TYPES.length)];
      lines.push(`  field${f} ${type}`);
    }

    lines.push(`  profile BenchProfile${i % objectCount}`);
    lines.push('  spot BenchPoint?');
    lines.push('  nextId Record');
    lines.push(`  next Relation @field(nextId) @model(BenchModel${(i + 1) % models})`);
    lines.push(`  previous Relation[] @model(BenchModel${(i + models - 1) % models})`);
    blocks.push(`model BenchModel${i} {\n${lines.join('\n')}\n}`);
  }

  return `${blocks.join('\n\n')}\n`;
}
