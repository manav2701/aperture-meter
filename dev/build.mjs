// Bundles the meter into the one file the Claude Code plugin ships: ../scripts/meter.mjs.
// It needs only Node. Run from this folder: npm run build
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'src/cli.ts')],
  outfile: join(here, '../scripts/meter.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: false,
  banner: { js: '// Generated from dev/src by `npm run build` in dev/. Do not edit.' },
  logLevel: 'info',
});
