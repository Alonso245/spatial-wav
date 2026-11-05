// npm install --prefix /tmp/atmos-browser-test playwright
// NODE_PATH=/tmp/atmos-browser-test/node_modules node tests/browser-smoke.cjs <sample.m4a> <output.wav>
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const sample = process.argv[2];
  if (!sample) throw new Error('Provide a local E-AC-3/JOC sample path.');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ acceptDownloads: true, locale: 'es-PE' });
    const errors = [], uploads = [], remote = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { console.log('BROWSER:', message.text()); });
    page.on('request', r => {
      if (r.method() !== 'GET') uploads.push(r.url());
      if (!r.url().startsWith('http://127.0.0.1:8080/') && !r.url().startsWith('blob:')) remote.push(r.url());
    });
    await page.goto('http://127.0.0.1:8080/');
    await page.getByRole('dialog').getByRole('button', { name: /^Modo claro/ }).click();
    await page.getByText('Listo en tu dispositivo').waitFor({ timeout: 120000 });
    console.log('PASS: published WASM engine and OPFS initialized');

    await page.locator('input[type=file]').setInputFiles({ name: 'bad.ec3', mimeType: 'application/octet-stream', buffer: Buffer.alloc(256) });
    await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No se pudo convertir:' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Descargar WAV', exact: true }).count(), 0);
    console.log('PASS: malformed audio rejected without download');

    await page.locator('input[type=file]').setInputFiles(sample);
    const conversionStarted = Date.now();
    await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).click();
    const deadline = Date.now() + 1200000;
    while (!await page.getByRole('button', { name: 'Descargar WAV', exact: true }).isVisible()) {
      const status = await page.getByRole('status').innerText();
      if (status.startsWith('No se pudo convertir:')) throw new Error(status);
      if (errors.length) throw new Error(errors.join('\n'));
      if (Date.now() > deadline) throw new Error('Timed out: ' + status);
      if (Math.floor((deadline - Date.now()) / 2000) % 15 === 0)
        console.log('PROGRESS:', await page.locator('progress').getAttribute('value'), status);
      await page.waitForTimeout(2000);
    }
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar WAV', exact: true }).click()
    ]);
    const destination = process.argv[3] || '/tmp/atmos-browser-render.wav';
    await download.saveAs(destination);
    const fd = fs.openSync(destination, 'r');
    const header = Buffer.alloc(80); fs.readSync(fd, header); fs.closeSync(fd);
    assert.equal(header.toString('ascii', 0, 4), 'RIFF');
    assert.equal(header.readUInt16LE(22), 16);
    assert.equal(header.readUInt32LE(24), 48000);
    assert.equal(header.readUInt32LE(76) + 80, fs.statSync(destination).size);
    console.log(`PASS: browser converted JOC into ${fs.statSync(destination).size} bytes of WAV`);
    console.log(`CONVERSION: ${((Date.now() - conversionStarted) / 1000).toFixed(1)} seconds including save`);
    await page.getByText('Mapa de canales', { exact: true }).click();
    const [layout] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar mapa de canales (JSON)' }).click()
    ]);
    const layoutPath = destination + '.channels.json';
    await layout.saveAs(layoutPath);
    const mapping = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
    assert.equal(mapping.channels.length, 16);
    assert.equal(mapping.channels[12].name, 'Ltm');
    assert.equal(await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Nueva conversión' }).click();
    await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('input[type=file]').inputValue(), '');
    const entries = await page.evaluate(async () => {
      const names = [];
      for await (const [name] of (await navigator.storage.getDirectory()).entries()) names.push(name);
      return names;
    });
    assert.equal(entries.filter(name => name.startsWith('spatial-output-')).length, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(uploads, []);
    assert.deepEqual(remote, []);
    await page.screenshot({ path: '/tmp/atmos-browser.png', fullPage: true });
    console.log('PASS: channel JSON, temp cleanup, no uploads, no third-party requests, no browser exceptions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
