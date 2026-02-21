import esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info',
};

const configs = [
  // Desktop client
  {
    ...baseConfig,
    entryPoints: ['client/src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
  // Desktop server
  {
    ...baseConfig,
    entryPoints: ['server/src/server.ts'],
    outfile: 'dist/server.js',
    platform: 'node',
    format: 'cjs',
  },
  // Web client
  {
    ...baseConfig,
    entryPoints: ['client/src/browserExtension.ts'],
    outfile: 'dist/browserExtension.js',
    platform: 'browser',
    format: 'cjs',
    external: ['vscode'],
  },
  // Web server
  {
    ...baseConfig,
    entryPoints: ['server/src/browserServer.ts'],
    outfile: 'dist/browserServer.js',
    platform: 'browser',
    format: 'cjs',
  },
];

async function build() {
  try {
    if (isWatch) {
      const contexts = await Promise.all(configs.map((config) => esbuild.context(config)));
      await Promise.all(contexts.map((ctx) => ctx.watch()));
      console.log('Watching for changes...');
    } else {
      await Promise.all(configs.map((config) => esbuild.build(config)));
      console.log('Build completed successfully');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
