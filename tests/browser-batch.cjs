// Serve dist/wwwroot on 127.0.0.1:8080, then provide a short real EC3/JOC sample.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const full=fs.readFileSync(process.argv[2] || '/tmp/spatial-night-sample.ec3');
 const short=fs.readFileSync(process.argv[3] || '/tmp/spatial-batch-short.ec3');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({acceptDownloads:true,locale:'es-PE',viewport:{width:1280,height:1100}});
  const errors=[],uploads=[],remote=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER:',m.text());});
  page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());if(r.url().startsWith('http')&&!r.url().startsWith('http://127.0.0.1:8080/'))remote.push(r.url());});
  await page.goto('http://127.0.0.1:8080/');
  await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
  await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
  const input=page.locator('input[type=file]');
  const rows=page.locator('.file-queue>li');
  const payload=(name,buffer)=>({name,mimeType:'application/octet-stream',buffer});
  const fullPayload=payload('same.ec3',full),shortPayload=payload('same.ec3',short),bad=payload('bad.ec3',Buffer.alloc(256));
  async function waitRows(count){await page.waitForFunction(n=>document.querySelectorAll('.file-queue>li').length===n,count);}
  async function drop(name,buffer,selector='.drop'){
   const dt=await page.evaluateHandle(({name,bytes})=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name));return dt;},{name,bytes:[...buffer]});
   await page.locator(selector).dispatchEvent('dragenter',{dataTransfer:dt});
   await page.locator(selector).dispatchEvent('dragover',{dataTransfer:dt});
   assert.equal(await page.locator(selector).getAttribute('data-dragging'),'true');
   await page.locator(selector).dispatchEvent('drop',{dataTransfer:dt});await dt.dispose();
  }
  async function convert(){await page.locator('.convert-action').click();}
  async function download(row,path){const [file]=await Promise.all([page.waitForEvent('download'),row.locator('.download-action').click()]);await file.saveAs(path);return fs.readFileSync(path);}
  async function reset(){await page.getByRole('button',{name:'Nueva conversión'}).click();await page.locator('.convert-action').waitFor();}
  async function outputs(){return page.evaluate(async()=>{let n=0;for await(const [name] of(await navigator.storage.getDirectory()).entries())if(name.startsWith('spatial-output-'))n++;return n;});}
  async function settings(bits,rate){await page.locator('.export-options').evaluate(el=>el.open=true);await page.locator('#bit-depth').selectOption(String(bits));await page.locator('#sample-rate').selectOption(String(rate));}
  assert.ok(await input.getAttribute('multiple')!==null);
  await input.setInputFiles([fullPayload,bad]);await waitRows(2);
  const originalIds=await rows.evaluateAll(els=>els.map(e=>e.dataset.jobId));
  await drop('same.ec3',short);await waitRows(3);
  assert.deepEqual((await rows.evaluateAll(els=>els.map(e=>e.dataset.jobId))).slice(0,2),originalIds);
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Añadir archivos',exact:true}).click()]);
  await chooser.setFiles(payload('invalid.txt',Buffer.from('not audio')));await waitRows(4);
  assert.equal(await rows.nth(3).getAttribute('data-state'),'failed');
  assert.equal(await page.locator('.drop').getAttribute('data-dragging'),null);
  await page.waitForTimeout(300);await page.screenshot({path:'/workspace/spatial-batch-queued.png',fullPage:true});
  // Hold the third job before it starts writing; the first result must remain downloadable.
  await page.evaluate(()=>{
   window.batchOriginalBegin=spatial.begin;window.batchStarts=[];window.batchOriginalWrite=spatial.write;
   spatial.write=async bytes=>{if(bytes.length>80&&window.testHoldWrite&&!window.cancelWriteHeld){window.cancelWriteHeld=true;await new Promise(resolve=>window.releaseCancelledWrite=resolve);}if(bytes.length>80&&window.testQuota&&!window.quotaFailed){window.quotaFailed=true;throw new Error('Simulated storage quota failure');}return batchOriginalWrite(bytes);};
   spatial.begin=async id=>{batchStarts.push(id);if(batchStarts.length===3)await new Promise(resolve=>window.releaseThird=resolve);return batchOriginalBegin(id);};
  });
  await convert();
  await page.waitForFunction(()=>window.releaseThird,{},{timeout:180000});
  assert.equal(await rows.nth(0).getAttribute('data-state'),'ready',await rows.nth(0).innerText());
  assert.equal(await rows.nth(1).getAttribute('data-state'),'failed');
  assert.equal(await page.locator('#blazor-error-ui').isVisible(),false,'Malformed audio only fails its queue entry');
  assert.equal(await rows.nth(2).getAttribute('data-state'),'reading');
  assert.ok(await input.isDisabled());assert.ok(await page.locator('#bit-depth').isDisabled());
  const first=await download(rows.nth(0),'/tmp/batch-first.wav');
  assert.equal(first.readUInt32LE(24),48000);assert.equal(first.readUInt16LE(34),32);assert.equal(first.readUInt32LE(76)+80,first.length);
  await page.evaluate(()=>window.releaseThird());
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===2,{},{timeout:180000});
  await page.getByRole('status').filter({hasText:'Cola terminada'}).waitFor();
  const second=await download(rows.nth(2),'/tmp/batch-second.wav');
  assert.equal(second.readUInt32LE(76)+80,second.length);assert.ok(first.length>second.length);
  assert.equal((second.length-80)/64,24576);
  assert.deepEqual(await download(rows.nth(0),'/tmp/batch-first-again.wav'),first,'Earlier result not replaced by the final output');
  if(process.env.SPATIAL_BASELINE_WAV)assert.deepEqual(first,fs.readFileSync(process.env.SPATIAL_BASELINE_WAV),'Default audio matches pre-batch browser baseline');
  assert.equal(await outputs(),2,'Failed outputs are deleted without deleting successes');
  await rows.nth(3).locator('.remove-file').click();await rows.nth(1).locator('.remove-file').click();await waitRows(2);
  await drop('same.ec3',short,'.panel');await waitRows(3);await settings(16,44100);await convert();
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===3,{},{timeout:180000});
  const third=await download(rows.nth(2),'/tmp/batch-third.wav');
  assert.equal(third.readUInt32LE(24),44100);assert.equal(third.readUInt16LE(34),16);
  assert.equal((third.length-80)/32,Math.round(24576*44100/48000));
  assert.deepEqual(await download(rows.nth(0),'/tmp/batch-first-after-new-settings.wav'),first);
  await rows.nth(0).locator('.channel-map summary').click();
  const [map]=await Promise.all([page.waitForEvent('download'),rows.nth(0).getByRole('button',{name:'Descargar mapa de canales (JSON)'}).click()]);
  await map.saveAs('/tmp/batch-map.json');const mapping=JSON.parse(fs.readFileSync('/tmp/batch-map.json'));
  assert.equal(mapping.sampleRate,48000);assert.equal(mapping.bitDepth,32);assert.equal(mapping.channels.length,16);
  for(const theme of ['dark','light']) {
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle').click();
   for(const lang of ['English','Español']) {
    await page.getByRole('button',{name:lang,exact:true}).click();
    for(const width of [320,390,1280]) {await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${lang}/${width} fits`);}
   }
   await page.screenshot({path:`/workspace/spatial-batch-${theme}.png`,fullPage:true});
  }
  console.log('PASS: native multiple picker, real drops, append safety, duplicate filenames, isolated errors, independent downloads, retained formats, ES/EN, themes and mobile');
  await reset();assert.equal(await outputs(),0);
  await input.setInputFiles([fullPayload,shortPayload]);await waitRows(2);await settings(32,48000);
  await page.evaluate(()=>window.testHoldWrite=true);
  await convert();await page.waitForFunction(()=>window.releaseCancelledWrite,{},{timeout:120000});
  await page.getByRole('button',{name:'Detener cola',exact:true}).click();
  await page.evaluate(()=>window.releaseCancelledWrite());
  await page.waitForFunction(()=>document.querySelector('.file-queue>li')?.dataset.state==='cancelled');
  assert.equal(await rows.nth(1).getAttribute('data-state'),'pending');assert.equal(await outputs(),0);
  await page.evaluate(()=>{window.testHoldWrite=false;window.testQuota=false;});
  await convert();await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===2,{},{timeout:180000});
  console.log('PASS: stop queue removes partial output, leaves later files pending, then resumes successfully');
  await reset();await input.setInputFiles([fullPayload,shortPayload]);await waitRows(2);
  await page.evaluate(()=>{window.quotaFailed=false;window.testQuota=true;});
  await convert();await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===1,{},{timeout:180000});
  await page.getByRole('status').filter({hasText:'Cola terminada'}).waitFor();
  assert.equal(await rows.nth(0).getAttribute('data-state'),'failed');assert.match(await rows.nth(0).innerText(),/salida local/);
  assert.equal(await outputs(),1);
  await page.evaluate(()=>{window.testHoldWrite=false;window.testQuota=false;});await convert();
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===2,{},{timeout:180000});
  assert.equal(await outputs(),2);
  console.log('PASS: storage error affects only one job, cleanup and retry retain the other completed output');
  await reset();assert.equal(await outputs(),0);
  await input.setInputFiles(Array.from({length:21},(_,i)=>payload(`invalid-${i}.txt`,Buffer.from('test'))));
  await waitRows(20);await page.getByRole('status').filter({hasText:'hasta 20 archivos'}).waitFor();
  await reset();assert.equal(await outputs(),0);assert.equal(await input.inputValue(),'');
  await page.emulateMedia({reducedMotion:'reduce'});
  await input.setInputFiles([fullPayload,shortPayload]);await waitRows(2);
  assert.equal(await rows.nth(0).evaluate(el=>getComputedStyle(el).animationName),'none');
  await reset();
  assert.equal(await page.locator('#blazor-error-ui').isVisible(),false,'Handled file failures must not display a fatal engine error');
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(remote,[]);
  console.log('PASS: queue cap, clear/reset cleanup, no uploads or third-party requests, no unhandled browser errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
