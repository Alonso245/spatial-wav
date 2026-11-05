// Run against the published static site used by browser-smoke.cjs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, locale: 'es-PE' });
    await page.goto(process.env.ATMOS_TEST_URL || 'http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Sonido que encuentra su lugar.' }).waitFor();
    console.log('PASS: initial page visible before engine readiness');
    await page.getByText('Listo en tu dispositivo').waitFor({ timeout: 120000 });
    assert.equal(await page.getByRole('button', { name: 'Español', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Convertir a WAV', exact: true }).isDisabled(), true);
    await page.screenshot({ path: '/workspace/spatial-desktop-es.png', fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/workspace/spatial-mobile-es.png', fullPage: true });
    await page.getByText('¿Qué contiene el WAV 9.1.6?', { exact: true }).click();
    assert.equal(await page.getByText('Un render de altavoces:', { exact: false }).isVisible(), true);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Convert to WAV', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'English', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.match(await page.title(), /spatial/i);
    assert.doesNotMatch(await page.locator('body').innerText(), /atmos|dolby/i);
    await page.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') });
    await page.getByRole('status').filter({ hasText: 'Choose an EC3' }).waitFor();
    await page.getByRole('button', { name: 'Español', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Selecciona un archivo' }).waitFor();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.reload();
    await page.getByText('Ready on your device').waitFor({ timeout: 120000 });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: '/workspace/spatial-desktop-en.png', fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `English layout fits ${width}px`);
    }
    const englishPage = await browser.newPage({ locale: 'en-US' });
    await englishPage.goto(process.env.ATMOS_TEST_URL || 'http://127.0.0.1:8080/');
    await englishPage.getByText('Ready on your device').waitFor({ timeout: 120000 });
    assert.equal(await englishPage.locator('html').getAttribute('lang'), 'en');
    console.log('PASS: ES/EN selector, translated validation, language persistence, automatic English detection, Spatial branding');
    console.log('PASS: desktop/mobile layouts, disabled empty state, disclosure controls');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
