// build.js
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runBuild() {
  console.log('Starting production bundle build...');

  const distDir = path.join(__dirname, 'dist');

  // 1. Clean previous build if any
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir);

  // 2. Copy static files (index.html, event.html)
  fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(distDir, 'index.html'));
  fs.copyFileSync(path.join(__dirname, 'event.html'), path.join(distDir, 'event.html'));

  // 3. Copy css and assets folders recursively
  const cssSrc = path.join(__dirname, 'css');
  const cssDest = path.join(distDir, 'css');
  if (fs.existsSync(cssSrc)) {
    fs.cpSync(cssSrc, cssDest, { recursive: true });
  }

  const assetsSrc = path.join(__dirname, 'assets');
  const assetsDest = path.join(distDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
  }

  // 4. Bundle and minify our modular ES Modules with esbuild
  // We explicitly disable sourcemap to prevent original source files mapping in DevTools!
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, 'js/app.js'),
      path.join(__dirname, 'js/public-event.js')
    ],
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ['es2020'],
    outdir: path.join(distDir, 'js'),
    format: 'esm',
    logLevel: 'info',
  });

  console.log('Build completed successfully.');
}

runBuild().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
