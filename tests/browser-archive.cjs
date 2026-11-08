// Serve dist/wwwroot on 127.0.0.1:8080. Requires the same two EC3 fixtures as browser-batch.cjs.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
(async()=>{
 const full=fs.readFileSync('/tmp/spatial-night-sample.ec3'),short=fs.readFileSync('/tmp/spatial-batch-short.ec3');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({acceptDownloads:true,locale:'es-PE',viewport:{width:1280,height:1100}});
  const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  await page.goto('http://127.0.0.1:8080/');await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
  await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
  const input=page.locator('input[type=file]'),rows=page.locator('.file-queue>li'),all=page.locator('.download-all');
  const payload=bytes=>({name:'canción_ñ.ec3',mimeType:'audio/eac3',buffer:bytes});
  async function entries(){return page.evaluate(async()=>{const names=[];for await(const[n]of(await navigator.storage.getDirectory()).entries())names.push(n);return names;});}
  async function convert(count){await page.locator('.convert-action').click();await page.waitForFunction(n=>document.querySelectorAll('.file-queue>li[data-state=ready]').length===n,count,{timeout:180000});await page.waitForFunction(()=>!document.querySelector('.download-all')?.disabled);}
  async function zip(path){const [file]=await Promise.all([page.waitForEvent('download'),all.click()]);await file.saveAs(path);return path;}
  function verify(path,count){
   const code=`import zipfile,sys,struct,json,pathlib\nz=zipfile.ZipFile(sys.argv[1]);count=int(sys.argv[2]);assert z.testzip() is None\nnames=z.namelist();assert len(names)==count*2 and len(set(names))==len(names)\nassert all('/' not in n and '\\\\' not in n for n in names)\nassert any('canción_ñ' in n for n in names)\nfor index,n in enumerate(n for n in names if n.endswith('.wav')):\n data=z.read(n);rate=struct.unpack_from('<I',data,24)[0];bits=struct.unpack_from('<H',data,34)[0]\n assert struct.unpack_from('<I',data,76)[0]+80==len(data)\n mapping=json.loads(z.read(n[:-4]+'.channels.json'));assert mapping['sampleRate']==rate and mapping['bitDepth']==bits and len(mapping['channels'])==16\n if index<2: assert data==pathlib.Path('/tmp/archive-source-'+str(index)+'.wav').read_bytes()\nprint('PASS: ZIP64 structure, CRCs, Unicode, unique names, exact WAV bytes and matching channel maps')`;
   console.log(execFileSync('python3',['-c',code,path,String(count)],{encoding:'utf8'}).trim());
  }
  await input.setInputFiles([payload(full),payload(short),{name:'bad.ec3',mimeType:'audio/eac3',buffer:Buffer.alloc(256)}]);await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===3);
  await convert(2);assert.equal((await entries()).filter(n=>n.startsWith('spatial-archive-')).length,0,'No ZIP generated during conversion');
  for(let i=0;i<2;i++) {const [file]=await Promise.all([page.waitForEvent('download'),rows.nth(i).locator('.download-action').click()]);await file.saveAs('/tmp/archive-source-'+i+'.wav');}
  await page.locator('.queue-disclosure>.queue-heading').click();assert.equal(await page.locator('.file-queue').isVisible(),false);assert.ok(await all.isVisible());
  await page.evaluate(()=>{
   window.originalZipBuild=spatialZip.build;window.zipBuilds=0;window.holdZip=true;
   const originalArrayBuffer=Blob.prototype.arrayBuffer;
   Blob.prototype.arrayBuffer=function(){if(this.size>65536)throw new Error('Attempted to buffer a complete audio file');return originalArrayBuffer.call(this);};
   spatialZip.build=async(entries,destination,options)=>{
    zipBuilds++;
    if(holdZip)await new Promise(resolve=>window.releaseZip=resolve);
    const sink={write:async bytes=>{if(window.failZip&&bytes.length>1000)throw new Error('Simulated ZIP quota exceeded');await destination.write(bytes);}};
    return originalZipBuild(entries,sink,options);
   };
  });
  await all.click();await page.waitForFunction(()=>window.releaseZip);
  assert.ok(await all.isDisabled());assert.equal(await all.getAttribute('aria-busy'),'true');assert.ok(await input.isDisabled());
  await page.getByRole('button',{name:'Cancelar ZIP',exact:true}).click();
  await page.evaluate(()=>{holdZip=false;releaseZip();});
  await page.getByRole('status').filter({hasText:'Generación del ZIP cancelada'}).waitFor();
  assert.equal((await entries()).filter(n=>n.startsWith('spatial-archive-')).length,0);assert.equal(await rows.count(),3);
  assert.equal(await page.locator('.file-queue>li[data-state=ready]').count(),2);
  await zip('/tmp/spatial-batch-archive.zip');verify('/tmp/spatial-batch-archive.zip',2);
  assert.equal((await entries()).filter(n=>n.startsWith('spatial-archive-')).length,1);
  const builds=await page.evaluate(()=>zipBuilds);await zip('/tmp/spatial-batch-archive-again.zip');assert.equal(await page.evaluate(()=>zipBuilds),builds);
  assert.deepEqual(fs.readFileSync('/tmp/spatial-batch-archive-again.zip'),fs.readFileSync('/tmp/spatial-batch-archive.zip'));
  await input.setInputFiles(payload(short));await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===4);
  // User's collapsed accordion remains collapsed while queue entries change.
  assert.equal(await page.locator('.queue-disclosure').getAttribute('open'),null);
  await page.locator('.export-options').evaluate(el=>el.open=true);await page.locator('#bit-depth').selectOption('16');await page.locator('#sample-rate').selectOption('44100');
  await convert(3);await zip('/tmp/spatial-batch-mixed-archive.zip');verify('/tmp/spatial-batch-mixed-archive.zip',3);
  await input.setInputFiles(payload(short));await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===5);await convert(4);
  await page.evaluate(()=>window.failZip=true);await all.click();await page.getByRole('status').filter({hasText:'No se pudo generar el ZIP'}).waitFor();
  assert.equal((await entries()).filter(n=>n.startsWith('spatial-archive-')).length,0);assert.equal(await page.locator('.file-queue>li[data-state=ready]').count(),4);
  await page.evaluate(()=>window.failZip=false);await zip('/tmp/spatial-batch-retry-archive.zip');verify('/tmp/spatial-batch-retry-archive.zip',4);
  assert.equal(await page.locator('#blazor-error-ui').isVisible(),false);
  await page.locator('.queue-disclosure>.queue-heading').click();
  await rows.nth(2).locator('.remove-file').click();await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===4);
  assert.equal((await entries()).filter(n=>n.startsWith('spatial-archive-')).length,0,'Removing a queue entry clears the cached archive');
  await page.locator('.queue-disclosure>.queue-heading').click();
  await zip('/tmp/spatial-batch-clean-archive.zip');
  for(const theme of ['dark','light']) {
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle').click();
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.screenshot({path:`/workspace/spatial-archive-${theme}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'English',exact:true}).click();assert.match(await all.innerText(),/Download all \(4\)/);
  await page.evaluate(()=>{
   const remove=FileSystemDirectoryHandle.prototype.removeEntry;
   let hold=true;
   FileSystemDirectoryHandle.prototype.removeEntry=async function(name,...args){
    if(hold&&name.startsWith('spatial-archive-')){hold=false;await new Promise(resolve=>window.releaseCleanup=resolve);}
    return remove.call(this,name,...args);
   };
  });
  await page.getByRole('button',{name:'New conversion'}).click();await page.waitForFunction(()=>window.releaseCleanup);
  assert.ok(await input.isDisabled());assert.ok(await page.getByRole('button',{name:'New conversion'}).isDisabled());assert.ok(await all.isDisabled());
  await page.evaluate(()=>window.releaseCleanup());
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===0);
  assert.deepEqual((await entries()).filter(n=>/^spatial-(output|archive)-/.test(n)),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
  console.log('PASS: accordion, ZIP only on click, bounded streaming, cancellation, cached redownload, mixed formats, quota recovery, themes, English and reset cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
