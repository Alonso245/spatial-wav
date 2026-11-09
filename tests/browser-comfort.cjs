// Serve dist/wwwroot on localhost:8080. Uses real JOC audio; notifications are simulated.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const context=await browser.newContext({acceptDownloads:true,locale:'es-PE',viewport:{width:1100,height:1100}});
  await context.addInitScript(()=>{
   window.notices=[];window.permissionCalls=[];
   window.Notification=class {
    static permission='default';
    static async requestPermission(){permissionCalls.push(navigator.userActivation.isActive);this.permission='granted';return 'granted';}
    constructor(title,options){if(window.failNotice)throw Error('Notice unavailable');notices.push({title,...options});}
    close(){}
   };
  });
  const page=await context.newPage(),errors=[],uploads=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  await page.goto('http://127.0.0.1:8080/');
  await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
  await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
  assert.deepEqual(await page.evaluate(()=>permissionCalls),[]);
  await page.locator('.personal-preferences>summary').click();
  const toggle=page.getByRole('switch');await toggle.click();
  await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='true');
  assert.deepEqual(await page.evaluate(()=>permissionCalls),[true],'Permission requested only from a real user gesture');
  const payload=(name,data)=>({name,mimeType:'audio/eac3',buffer:data});
  const audio=fs.readFileSync('/tmp/spatial-night-sample.ec3');
  const input=page.locator('input[type=file]'),rows=page.locator('.file-queue>li');
  const guarded=()=>page.evaluate(()=>!dispatchEvent(new Event('beforeunload',{cancelable:true})));
  assert.equal(await guarded(),false);
  await page.evaluate(()=>{
   const begin=spatial.begin;window.starts=[];window.first=true;
   spatial.begin=async id=>{starts.push(id);if(first){first=false;await new Promise(r=>window.releaseBegin=r);throw Error('Simulated local write failure');}return begin(id);};
  });
  await input.setInputFiles([payload('reintento.ec3',audio),payload('inválido.ec3',Buffer.alloc(256)),payload('canción_ñ.ec3',audio)]);
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===3);
  await page.locator('.convert-action').click();await page.waitForFunction(()=>window.releaseBegin);
  assert.equal(await guarded(),true);
  let leaveDialog=false;
  page.once('dialog',async dialog=>{leaveDialog=dialog.type()==='beforeunload';await dialog.dismiss();});
  await page.evaluate(()=>location.reload());
  await page.waitForFunction(()=>document.querySelector('progress'));
  assert.equal(leaveDialog,true,'Reload asks before discarding an active conversion');
  await page.evaluate(()=>releaseBegin());
  await page.waitForFunction(()=>document.querySelectorAll('[data-state=ready]').length===1&&!document.querySelector('.convert-action').disabled,null,{timeout:180000});
  assert.equal(await guarded(),false);
  assert.equal(await page.evaluate(()=>notices.length),1);
  assert.match(await page.evaluate(()=>notices[0].body),/1 listos · 2 con error/);
  assert.doesNotMatch(await page.evaluate(()=>notices[0].body),/\.ec3/);
  const [download]=await Promise.all([page.waitForEvent('download'),rows.nth(2).locator('.download-action').click()]);
  await download.saveAs('/tmp/spatial-comfort-original.wav');
  assert.equal(Number(await rows.nth(2).locator('.size-pill').getAttribute('data-bytes')),fs.statSync('/tmp/spatial-comfort-original.wav').size);
  if(process.env.SPATIAL_BASELINE_WAV)assert.deepEqual(fs.readFileSync('/tmp/spatial-comfort-original.wav'),fs.readFileSync(process.env.SPATIAL_BASELINE_WAV));
  await input.setInputFiles(payload('pendiente.ec3',audio));
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===4);
  await page.locator('.export-options').evaluate(el=>el.open=true);
  await page.locator('#bit-depth').selectOption('16');await page.locator('#sample-rate').selectOption('44100');
  const starts=await page.evaluate(()=>window.starts.length);
  await rows.nth(0).locator('.retry-file').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-state=ready]').length===2&&!document.querySelector('.convert-action').disabled,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.starts.length),starts+1);
  assert.equal(await rows.nth(1).getAttribute('data-state'),'failed');assert.equal(await rows.nth(3).getAttribute('data-state'),'pending');
  assert.equal(await page.evaluate(()=>notices.length),2);assert.match(await page.evaluate(()=>notices[1].body),/1 listos\./);
  const [retryDownload]=await Promise.all([page.waitForEvent('download'),rows.nth(0).locator('.download-action').click()]);
  await retryDownload.saveAs('/tmp/spatial-comfort-retry.wav');const retry=fs.readFileSync('/tmp/spatial-comfort-retry.wav');
  assert.equal(retry.readUInt16LE(34),16);assert.equal(retry.readUInt32LE(24),44100);
  assert.equal(Number(await rows.nth(0).locator('.size-pill').getAttribute('data-bytes')),retry.length);
  const expectedZip=Number(await page.locator('.archive-size').getAttribute('data-bytes'));
  assert.equal(await page.evaluate(async()=>{let n=0;for await(const [name]of(await navigator.storage.getDirectory()).entries())if(name.startsWith('spatial-archive-'))n++;return n;}),0);
  await page.evaluate(()=>{const build=spatialZip.build;spatialZip.build=async(...args)=>{await new Promise(r=>window.releaseZip=r);return build(...args);};});
  await page.locator('.download-all').click();await page.waitForFunction(()=>window.releaseZip);assert.equal(await guarded(),true);
  const zipEvent=page.waitForEvent('download');await page.evaluate(()=>releaseZip());const zip=await zipEvent;await zip.saveAs('/tmp/spatial-comfort.zip');
  await page.waitForFunction(()=>!document.querySelector('.download-all').disabled);
  assert.equal(fs.statSync('/tmp/spatial-comfort.zip').size,expectedZip);assert.equal(await guarded(),false);
  for(const theme of ['dark','light']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle').click();
   for(const width of [320,390,1100]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.screenshot({path:`/workspace/spatial-comfort-${theme}.png`,fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'English',exact:true}).click();assert.match(await page.locator('.personal-preferences>summary').innerText(),/Make it yours/);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.personal-body').evaluate(el=>getComputedStyle(el).animationName),'none');
  await toggle.click();assert.equal(await page.evaluate(()=>permissionCalls.length),1);
  await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='false');
  await toggle.click();assert.equal(await page.evaluate(()=>permissionCalls.length),1,'Granted permission is reused');
  await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='true');
  await page.evaluate(()=>window.failNotice=true);
  await page.locator('.convert-action').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-state=ready]').length===3&&!document.querySelector('.convert-action').disabled,null,{timeout:180000});
  assert.equal(await toggle.getAttribute('aria-checked'),'false','Notification failure turns off alerts without failing audio');
  assert.equal(await guarded(),false);assert.equal(await page.evaluate(()=>notices.length),2);
  await page.reload();await page.getByText('Ready on your device',{exact:true}).waitFor({timeout:120000});
  assert.equal(await page.locator('#bit-depth').inputValue(),'16');assert.equal(await page.locator('#sample-rate').inputValue(),'44100');
  assert.deepEqual(await page.evaluate(()=>permissionCalls),[],'No permission requested on a new visit');
  await page.evaluate(()=>localStorage.setItem('spatial-export-settings-v1','{"bitDepth":24,"sampleRate":123}'));
  await page.reload();await page.getByText('Ready on your device',{exact:true}).waitFor({timeout:120000});
  assert.equal(await page.locator('#bit-depth').inputValue(),'32');assert.equal(await page.locator('#sample-rate').inputValue(),'48000');
  assert.equal(await guarded(),false);assert.equal(await page.locator('#blazor-error-ui').isVisible(),false);
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
  console.log('PASS: individual retry preserves other jobs, exact WAV/ZIP sizes, real reload guard, opt-in notification gesture, persistence, themes, English and reduced motion');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
