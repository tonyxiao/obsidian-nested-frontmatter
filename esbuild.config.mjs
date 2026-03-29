import esbuild from 'esbuild';
import process from 'node:process';

const production = process.argv.includes('production');
const watch = !production;

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  external: ['obsidian'],
  banner: {
    js: '/* eslint-disable */',
  },
});

if (watch) {
  await context.watch();
  console.log('Watching for changes...');
} else {
  await context.rebuild();
  await context.dispose();
}
