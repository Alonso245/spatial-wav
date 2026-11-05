// NODE_PATH=/opt/codex/cua_node/lib/node_modules node tests/browser-export.cjs <short.ec3>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage({acceptDownloads:true,locale:'es-PE'});
    const errors=[], uploads=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('request', r=>{if(r.method()!=='GET') uploads.push(r.url());});
    await page.goto(process.env.SPATIAL_TEST_URL || 'http://127.0.0.1:8080/');
    await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
    await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
    assert.equal(await page.locator('#bit-depth').inputValue(),'32');
    assert.equal(await page.locator('#sample-rate').inputValue(),'48000');
    await page.locator('.export-options summary').click();
    for(const theme of ['dark','light']) {
      if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.theme-toggle').click();
      for(const language of ['Español','English']) {
        await page.getByRole('button',{name:language,exact:true}).click();
        for(const width of [320,390,1280]) {
          await page.setViewportSize({width,height:1000});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${language}/${width} fits`);
        }
      }
      await page.screenshot({path:`/workspace/spatial-export-${theme}.png`,fullPage:true});
    }
    await page.getByRole('button',{name:'Español',exact:true}).click();
    let originalFrames;
    for(const rate of [48000,44100,96000]) for(const bits of [32,16]) {
      await page.locator('#bit-depth').selectOption(String(bits));
      await page.locator('#sample-rate').selectOption(String(rate));
      await page.locator('input[type=file]').setInputFiles(process.argv[2]);
      const start=Date.now();
      await page.getByRole('button',{name:'Convertir a WAV',exact:true}).click();
      // Settings remain frozen throughout conversion.
      if(await page.locator('#bit-depth').isVisible()) assert.ok(await page.locator('#bit-depth').isDisabled());
      await page.waitForFunction(()=>document.querySelector('.download-action') || /supera el rango|No se pudo convertir/.test(document.querySelector('.message')?.textContent),{},{timeout:180000});
      assert.equal(await page.locator('.download-action').count(),1,await page.locator('.message').innerText());
      assert.equal(await page.getByRole('button',{name:'Convertir a WAV',exact:true}).count(),0);
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.download-action').click()]);
      const destination=`/tmp/spatial-export-${bits}-${rate}.wav`;
      await download.saveAs(destination);
      const data=fs.readFileSync(destination);
      assert.equal(data.readUInt32LE(24),rate);assert.equal(data.readUInt16LE(34),bits);
      assert.equal(data.readUInt32LE(44),bits===32?3:1);
      assert.equal(data.readUInt32LE(76)+80,data.length);
      const frames=(data.length-80)/(16*bits/8);
      if(rate===48000 && bits===32) originalFrames=frames;
      assert.equal(frames,Math.round(originalFrames*rate/48000));
      if(bits===32) for(let i=80;i<data.length;i+=4) assert.ok(Number.isFinite(data.readFloatLE(i)));
      await page.locator('.channel-map summary').click();
      const [map]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar mapa de canales (JSON)'}).click()]);
      const path=destination+'.json';await map.saveAs(path);
      const mapping=JSON.parse(fs.readFileSync(path));
      assert.equal(mapping.sampleRate,rate);assert.equal(mapping.bitDepth,bits);
      assert.equal(mapping.dither,bits===16?'TPDF':null);
      assert.equal(mapping.channels.length,16);assert.equal(mapping.channels[12].name,'Ltm');
      console.log(`PASS: ${bits}-bit/${rate}: actual WAV and JSON agree, finite samples, ${((Date.now()-start)/1000).toFixed(1)}s`);
      await page.getByRole('button',{name:'Nueva conversión'}).click();
      // New file does not silently reset the user's export choices.
      assert.equal(await page.locator('#bit-depth').inputValue(),String(bits));
      assert.equal(await page.locator('#sample-rate').inputValue(),String(rate));
      await page.locator('.export-options summary').click();
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.export-body').evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
    const leftovers=await page.evaluate(async()=>{const names=[];for await(const [n] of(await navigator.storage.getDirectory()).entries())if(n.startsWith('spatial-output-'))names.push(n);return names;});
    assert.deepEqual(leftovers,[]);
    console.log('PASS: themes, ES/EN, mobile, reduced motion, settings persistence, cleanup and local processing');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
