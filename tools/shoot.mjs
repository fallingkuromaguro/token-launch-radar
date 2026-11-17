// Headless Chrome screenshots of the built dashboard, over the DevTools protocol (Node 22+, standard library only).
//   node tools/shoot.mjs <output-dir> <screenshots-dir>
// The page is opened from disk (this VM's Chromium blocks loads from 127.0.0.1), so the built output
// directory must hold dashboard/ and data.js, as main.ts writes them. Chrome's policy flags follow the
// best-game-01 build: the file holds one line, and its SHA-256 is passed too.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [outArg, shotsArg] = process.argv.slice(2);
if (!outArg || !shotsArg) {
  process.stderr.write('usage: node tools/shoot.mjs <output-dir> <screenshots-dir>\n');
  process.exit(2);
}
const out = resolve(outArg);
const shotsDir = resolve(shotsArg);
const CHROME = process.env.CHROME ?? '/opt/meta-chromium/chrome';
const DEBUG_PORT = 9341;
const W = 1440;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(join(root, '.tmp'), { recursive: true });
const policyPath = join(root, '.tmp', 'webgl-policy.txt');
writeFileSync(policyPath, 'hatch-webgl-allowed-domains-v1\n');
const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');

const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const watch = board.find((r) => r.watchlist);
const SHOTS = [
  { name: '1-board.png', query: '#/board' },
  { name: '2-detail.png', query: `#/p/${watch.slug}` },
  { name: '3-filtered.png', query: '#/board?chain=Ethereum&band=10m' },
];
const PAGE = pathToFileURL(join(out, 'dashboard', 'index.html')).href;

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-proxy-server',
  '--allow-file-access-from-files', `--remote-debugging-port=${DEBUG_PORT}`,
  `--hatch-webgl-allowed-domains-file=${policyPath}`, `--hatch-webgl-allowed-domains-sha256=${policySha}`,
  `--user-data-dir=${join(root, '.tmp', 'chrome')}`, `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

function shutdown(code) {
  chrome.kill('SIGKILL');
  process.exit(code);
}

async function waitForChrome() {
  for (let i = 0; i < 150; i += 1) {
    try {
      await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not start');
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve: res, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else res(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
    }
  };
  return new Promise((resolveClient, rejectClient) => {
    ws.onerror = () => rejectClient(new Error('websocket failed'));
    ws.onopen = () => resolveClient({
      send: (method, params = {}) => new Promise((res, rej) => {
        id += 1;
        waiting.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      errors,
      close: () => ws.close(),
    });
  });
}

try {
  await waitForChrome();
  mkdirSync(shotsDir, { recursive: true });
  for (const shot of SHOTS) {
    const tab = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(PAGE + shot.query)}`, { method: 'PUT' })).json();
    const cdp = await client(tab.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      await sleep(100);
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: 'document.getElementById("view") && document.getElementById("view").children.length > 0 && document.querySelectorAll("tr").length >= 0',
        returnByValue: true,
      });
      ready = result.value === true;
    }
    await sleep(400);
    if (!ready) throw new Error(`${shot.name}: the page never drew its view`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(data, 'base64');
    writeFileSync(join(shotsDir, shot.name), bytes);
    const errs = cdp.errors.length ? ` page errors: ${cdp.errors.join(' | ')}` : '';
    console.log(`${shot.name}: ${bytes.length} bytes, ${W}x${H}, ${shot.query}${errs}`);
    cdp.close();
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${tab.id}`);
  }
  shutdown(0);
} catch (err) {
  process.stderr.write(`shoot: ${err.message}\n`);
  shutdown(1);
}
