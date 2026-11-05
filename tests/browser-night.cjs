// Serve the built web root on port 8080 and provide a compatible local EC3/JOC sample.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ locale: 'es-PE', colorScheme: 'dark', acceptDownloads: true, viewport: { width: 1280, height: 1100 } });
    const errors = [], remote = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:8080/')) remote.push(r.url()); });
    const url = process.env.SPATIAL_TEST_URL || 'http://127.0.0.1:8080/';
    await page.goto(url);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    const choice = page.getByRole('dialog');
    await choice.waitFor();
    await page.screenshot({ path: '/workspace/spatial-appearance-choice.png', fullPage: true });
    await choice.getByRole('button', { name: /^Modo noche/ }).click();
    await page.getByText('Listo en tu dispositivo').waitFor({ timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('400 16px "DM Sans"') && document.fonts.check('italic 400 40px "Newsreader"')), true);
    await page.locator('input[type=file]').setInputFiles(process.argv[2]);
    await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).click();
    await page.getByRole('button', { name: 'Descargar WAV', exact: true }).waitFor({ timeout: 120000 });
    assert.equal(await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).count(), 0);
    await page.screenshot({ path: '/workspace/spatial-night-result.png', fullPage: true });
    // Hold only the test's download promise so the actual loading state can be observed.
    await page.evaluate(() => {
      const original = spatial.download;
      spatial.download = async name => { await new Promise(resolve => { window.releaseTestDownload = resolve; }); return original(name); };
    });
    await page.getByRole('button', { name: 'Descargar WAV', exact: true }).click();
    const pending = page.getByRole('button', { name: 'Preparando descarga…', exact: true });
    await pending.waitFor();
    assert.equal(await pending.isDisabled(), true);
    assert.equal(await pending.getAttribute('aria-busy'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Nueva conversión' }).isDisabled(), true);
    await page.screenshot({ path: '/workspace/spatial-night-preparing.png', fullPage: true });
    const downloadEvent = page.waitForEvent('download');
    await page.evaluate(() => window.releaseTestDownload());
    const download = await downloadEvent;
    await download.saveAs('/tmp/spatial-night-output.wav');
    assert.equal(fs.readFileSync('/tmp/spatial-night-output.wav').readUInt16LE(22), 16);
    await page.getByRole('status').filter({ hasText: 'Descarga iniciada.' }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /tardar unos segundos|take a few seconds/);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Day mode', exact: true }).waitFor();
    await page.getByRole('button', { name: 'New conversion' }).click();
    await page.getByRole('button', { name: 'Convert to WAV', exact: true }).waitFor();
    assert.equal(await page.locator('input[type=file]').inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Convert to WAV', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(async () => { let n = 0; for await (const [name] of (await navigator.storage.getDirectory()).entries()) if (name.startsWith('spatial-output-')) n++; return n; }), 0);
    await page.getByRole('button', { name: 'Day mode', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.reload(); await page.getByText('Ready on your device').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.screenshot({ path: '/workspace/spatial-day.png', fullPage: true });
    await page.getByRole('button', { name: 'Night mode', exact: true }).click();
    await page.waitForTimeout(200); // Finish the CSS color transition before capturing.
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.screenshot({ path: '/workspace/spatial-night-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    console.log('PASS: first-visit theme choice, local fonts, result-only download, preparation spinner, real WAV download, ES/EN labels, reset/cleanup, saved theme and mobile layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
