// Run from repository root after `npx vite build`. See README.md.
const { chromium } = require('playwright-core');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const { performance } = require('node:perf_hooks');

(async () => {
  const start = performance.now();
  const out = resolve('tools/capture/samples');
  await mkdir(out, { recursive: true });
  const report = { startedAt: new Date().toISOString(), stages: {}, errors: [], responses: {}, screenshots: [] };
  let browser, server;
  const elapsed = () => +((performance.now() - start) / 1000).toFixed(3);
  const stage = name => { report.stages[name] = elapsed(); };
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/opt/meta-chromium/chrome',
      headless: true, timeout: 30000,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    });
    report.browser = browser.version(); stage('browserLaunched');
    const root = resolve('dist');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg' };
    server = createServer(async (req, res) => {
      try {
        const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        const data = await readFile(path);
        res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(data);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
    stage('serverListening');
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('requestfailed', req => report.errors.push(`${req.url()}: ${req.failure()?.errorText}`));
    page.on('response', res => { const key = `${new URL(res.url()).hostname} ${res.status()}`; report.responses[key] = (report.responses[key] || 0) + 1; });
    const navigation = performance.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/awakening.html?place=tokyo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    stage('domLoaded');
    await page.waitForFunction(() => window.__ready === true, { timeout: 120000 });
    stage('appReady');
    // App ready is not tile ready. Bounded 30 s initial wait + three samples.
    await page.waitForTimeout(30000);
    for (let i = 0; i < 3; i++) {
      const name = `awakening-${i}.png`;
      await page.screenshot({ path: resolve(out, name), timeout: 60000 });
      report.screenshots.push({ name, navigationSeconds: +((performance.now() - navigation) / 1000).toFixed(3) });
      if (i < 2) await page.waitForTimeout(10000);
    }
    report.status = await page.locator('#status').textContent();
    report.result = 'captured-unverified'; // Statistics and visual inspection must follow.
  } catch (e) {
    report.result = 'blocked'; report.errors.push(String(e)); process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server?.listening) await new Promise(ok => server.close(ok));
    report.totalSeconds = elapsed();
    await writeFile(resolve(out, 'run.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
})();
