import Link from 'next/link';

const features = [
  {
    title: 'Schema-First',
    description:
      'Define models in .cerial files with a clean, readable syntax. Generate a fully typed TypeScript client automatically.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: 'Type-Safe Queries',
    description:
      'findMany, findOne, create, update, delete with return types that narrow dynamically based on select and include.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
  },
  {
    title: 'Full Relations',
    description:
      '1:1, 1:N, and N:N relations with nested create, connect, disconnect, and cascade behavior.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    title: 'Transactions',
    description:
      'Array mode, callback mode, and manual mode with retry support and automatic cleanup.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
  {
    title: 'Rich Type System',
    description:
      'CerialId, CerialUuid, CerialDuration, CerialDecimal, CerialBytes, CerialGeometry — wrapper classes with full APIs.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    title: 'CLI & Tooling',
    description:
      'Generate, format, watch mode, multi-schema support, and VS Code extension with IntelliSense.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
];

const stats = [
  { value: '63+', label: 'Test schemas' },
  { value: '2600+', label: 'Unit tests' },
  { value: '3.x', label: 'SurrealDB support' },
  { value: 'Apache 2.0', label: 'License' },
];

const schemaCode = `model User {
  id        Record    @id
  email     Email     @unique
  name      String
  age       Int?
  role      Role      @default(Viewer)
  createdAt Date      @createdAt
  posts     Relation[] @model(Post)
}`;

const queryCode = `const users = await client.db.User.findMany({
  where: { isActive: true },
  select: { id: true, name: true, email: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});

// Return type narrows automatically
// users: { id: CerialId; name: string; email: string }[]`;

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 pb-20 pt-28 text-center bg-gradient-to-b from-fd-background to-fd-secondary/20">
        <div className="mb-6 inline-flex items-center rounded-full border border-fd-border bg-fd-card px-4 py-1.5 text-sm text-fd-muted-foreground">
          Schema-first ORM for SurrealDB
        </div>

        <div className="mb-6 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <strong>Warning:</strong> Cerial is under active development and not yet ready for production use. APIs may change between releases.
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-fd-primary to-fd-primary/60 bg-clip-text text-transparent">
            Cerial
          </span>
        </h1>

        <p className="mb-10 max-w-2xl text-lg text-fd-muted-foreground sm:text-xl">
          A Prisma-like ORM for SurrealDB with schema-driven code generation and
          full TypeScript type safety.
        </p>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/getting-started"
            className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow-sm transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/cerial-orm/cerial"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border px-6 py-3 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>

        <div className="rounded-lg border border-fd-border bg-fd-card px-6 py-3">
          <code className="text-sm text-fd-muted-foreground">
            <span className="select-none text-fd-muted-foreground/60">$ </span>
            <span className="text-fd-foreground">npm install cerial</span>
          </code>
        </div>
      </section>

      {/* Code Preview */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Schema to queries in seconds
            </h2>
            <p className="text-fd-muted-foreground">
              Define your schema, generate a client, and start querying with
              full type safety.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-fd-muted-foreground">
                Schema
              </div>
              <pre className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-6 font-mono text-sm leading-relaxed text-fd-foreground">
                {schemaCode}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-fd-muted-foreground">
                TypeScript
              </div>
              <pre className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-6 font-mono text-sm leading-relaxed text-fd-foreground">
                {queryCode}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="px-6 py-24 bg-fd-secondary/10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Everything you need
            </h2>
            <p className="text-fd-muted-foreground">
              A complete ORM with schema generation, type-safe queries, and rich
              tooling.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/50"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for SurrealDB */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Built for SurrealDB
          </h2>
          <p className="mb-12 text-lg text-fd-muted-foreground">
            Built specifically for SurrealDB — leveraging record links,
            multi-model capabilities, and SurrealQL natively.
          </p>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-fd-border bg-fd-card p-6"
              >
                <div className="mb-1 text-2xl font-bold text-fd-primary">
                  {stat.value}
                </div>
                <div className="text-sm text-fd-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get Started CTA */}
      <section className="px-6 py-24 bg-gradient-to-b from-fd-secondary/10 to-fd-background">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">
            Ready to build?
          </h2>
          <p className="mb-10 text-lg text-fd-muted-foreground">
            Define your schema, generate your client, start querying.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/introduction"
              className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow-sm transition-colors hover:bg-fd-primary/90"
            >
              Read the Docs
            </Link>
            <a
              href="https://github.com/cerial-orm/cerial"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-fd-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-fd-muted-foreground">
            Cerial — A Prisma-like ORM for SurrealDB
          </p>
          <p className="text-sm text-fd-muted-foreground">
            Apache 2.0 License ·{' '}
            <a
              href="https://github.com/cerial-orm/cerial"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-fd-foreground"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
