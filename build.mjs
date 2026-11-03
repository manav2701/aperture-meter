// Bundles the meter into the one file the Claude Code plugin ships: bin/meter.mjs.
// It needs only Node. Run: npm run build
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'src/cli.ts')],
  outfile: join(here, 'bin/meter.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: false,
  banner: { js: '// Generated from src/ by `npm run build`. Do not edit.' },
  logLevel: 'info',
});
