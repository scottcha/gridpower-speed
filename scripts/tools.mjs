/** Shared helpers for the browser scripts: find a running app or start one. */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function isOurs(base) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    const html = await response.text();
    return response.ok && html.includes('GRIDPOWER');
  } catch {
    return false;
  }
}

/**
 * Returns { base, stop }. Reuses BASE_URL, the dev port recorded in .tmp/dev.port,
 * or starts a private Vite server on a free port.
 */
export async function ensureServer() {
  if (process.env.BASE_URL) {
    if (!(await isOurs(process.env.BASE_URL))) {
      throw new Error(`BASE_URL ${process.env.BASE_URL} does not serve GRIDPOWER. Is the dev server running?`);
    }
    return { base: process.env.BASE_URL.replace(/\/?$/, '/'), stop: () => {} };
  }
  if (existsSync('.tmp/dev.port')) {
    const base = `http://127.0.0.1:${readFileSync('.tmp/dev.port', 'utf8').trim()}/`;
    if (await isOurs(base)) return { base, stop: () => {} };
  }
  const port = await freePort();
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
    detached: false,
  });
  const base = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await isOurs(base)) return { base, stop: () => child.kill() };
  }
  child.kill();
  throw new Error('Vite did not become ready');
}
