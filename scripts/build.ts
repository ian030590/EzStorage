import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const demo = process.argv.includes('--demo');
const outdir = demo ? 'dist-demo' : 'dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ['prototype/bootstrap.ts'],
  outfile: path.join(outdir, 'bootstrap.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  plugins: demo ? [{
    name: 'demo-transport',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/transport\.ts$/ }, args => ({ path: path.join(args.resolveDir, 'demo-transport.ts') }));
    },
  }] : [],
});
await Promise.all(['index.html', 'styles.css'].map(file => copyFile(path.join('prototype', file), path.join(outdir, file))));
