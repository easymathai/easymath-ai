#!/usr/bin/env node
/**
 * Renders lumora-instagram-reel/index.html to a 1080x1920 MP4.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(ROOT, 'frames');
const OUT = path.join(ROOT, 'lumora-instagram-reel.mp4');
const ARTIFACT = '/opt/cursor/artifacts/lumora-instagram-reel.mp4';
const FPS = 30;
const DURATION = 18; // seconds
const TOTAL = FPS * DURATION;

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const { server, port } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--font-render-hinting=none', '--disable-lcd-text'],
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });

  // Freeze CSS animations and drive them via currentTime
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // fonts including Malayalam

  await page.evaluate(() => {
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
  });

  console.log(`Rendering ${TOTAL} frames at ${FPS}fps...`);
  for (let i = 0; i < TOTAL; i++) {
    const t = (i / FPS) * 1000; // ms
    await page.evaluate((ms) => {
      document.getAnimations().forEach((a) => {
        a.currentTime = ms;
      });
    }, t);
    const file = path.join(FRAMES, `frame-${String(i).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    if (i % 30 === 0) console.log(`  ${i}/${TOTAL} (${(i / FPS).toFixed(1)}s)`);
  }

  await browser.close();
  server.close();

  console.log('Encoding MP4 with ffmpeg...');
  const ff = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(FRAMES, 'frame-%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      '-preset', 'medium',
      '-movflags', '+faststart',
      '-r', String(FPS),
      OUT,
    ],
    { encoding: 'utf8' }
  );
  if (ff.status !== 0) {
    console.error(ff.stderr);
    process.exit(1);
  }

  fs.copyFileSync(OUT, ARTIFACT);
  console.log('Wrote', OUT);
  console.log('Artifact', ARTIFACT);

  // Keep a few preview frames, remove the rest to save space
  const keep = [0, 90, 180, 270, 360, 450, 530];
  for (const f of fs.readdirSync(FRAMES)) {
    const n = parseInt(f.replace(/\D/g, ''), 10);
    if (!keep.includes(n)) fs.unlinkSync(path.join(FRAMES, f));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
