import { build } from 'esbuild';

build({
  entryPoints: ['src/vercel.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  banner: {
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`,
  },
  external: ['@anthropic-ai/sdk', 'hono', 'mysql2', 'dotenv']
}).catch(() => process.exit(1));
