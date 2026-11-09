// Post-deployment check: real browser-local audio, WAV bytes, ZIP CRC and saved settings.
// node tests/browser-release.cjs <sample.m4a> [previous-reference.wav]
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
(async()=>{
 const site=process.env.SPATIAL_TEST_URL||'https://alonso245.github.io/vigilant-eureka/';
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({acceptDownloads:true,locale:'es-PE',viewport:{width:1280,height:1000}}),errors=[],uploads=[],remote=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());if(!r.url().startsWith(site)&&!r.url().startsWith('blob:'))remote.push(r.url());});
  await page.goto(site);await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
  await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
  const input=page.locator('input[type=file]'),rows=page.locator('.file-queue>li');
  const guarded=()=>page.evaluate(()=>!dispatchEvent(new Event('beforeunload',{cancelable:true})));
  await input.setInputFiles(process.argv[2]);await page.locator('.convert-action').click();
  assert.equal(await guarded(),true);
  await page.locator('.download-action').waitFor({timeout:240000});
  const [wav]=await Promise.all([page.waitForEvent('download'),page.locator('.download-action').click()]);
  const output='/tmp/spatial-published-release.wav';await wav.saveAs(output);
  assert.equal(Number(await page.locator('.size-pill').getAttribute('data-bytes')),fs.statSync(output).size);
  const fd=fs.openSync(output,'r'),header=Buffer.alloc(80);fs.readSync(fd,header);fs.closeSync(fd);
  assert.equal(header.toString('ascii',0,4),'RIFF');assert.equal(header.readUInt16LE(22),16);assert.equal(header.readUInt32LE(24),48000);assert.equal(header.readUInt16LE(34),32);
  assert.equal(header.readUInt32LE(76)+80,fs.statSync(output).size);assert.equal(await guarded(),false);
  if(process.argv[3])execFileSync('cmp',[output,process.argv[3]]);
  console.log('PASS: public AOT worker converts full M4A; real WAV size/header and previous audio bytes match');
  await input.setInputFiles([{name:'pequeño.ec3',mimeType:'audio/eac3',buffer:fs.readFileSync('/tmp/spatial-batch-short.ec3')},{name:'bad.ec3',mimeType:'audio/eac3',buffer:Buffer.alloc(256)}]);
  await page.waitForFunction(()=>document.querySelectorAll('.file-queue>li').length===3);
  await page.locator('.export-options').evaluate(el=>el.open=true);await page.locator('#bit-depth').selectOption('16');await page.locator('#sample-rate').selectOption('44100');
  await page.locator('.convert-action').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-state=ready]').length===2&&document.querySelector('[data-state=failed]')&&!document.querySelector('.convert-action').disabled,null,{timeout:120000});
  await rows.nth(2).locator('.retry-file').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-state=ready]').length===2&&document.querySelector('[data-state=failed]')&&!document.querySelector('.convert-action').disabled,null,{timeout:120000});
  const expectedZip=Number(await page.locator('.archive-size').getAttribute('data-bytes'));
  const [zip]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('.download-all').click()]);
  await zip.saveAs('/tmp/spatial-published-release.zip');assert.equal(fs.statSync('/tmp/spatial-published-release.zip').size,expectedZip);
  const verify=`import zipfile,json,struct,sys\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nassert len(z.namelist())==4\nformats=[]\nfor n in z.namelist():\n if n.endswith('.wav'):\n  with z.open(n) as f: h=f.read(80)\n  rate=struct.unpack_from('<I',h,24)[0];bits=struct.unpack_from('<H',h,34)[0];m=json.loads(z.read(n[:-4]+'.channels.json'));assert m['sampleRate']==rate and m['bitDepth']==bits;formats.append((rate,bits))\nassert formats==[(48000,32),(44100,16)]`;
  execFileSync('python3',['-c',verify,'/tmp/spatial-published-release.zip']);
  assert.equal(await guarded(),false);assert.equal(await page.locator('#blazor-error-ui').isVisible(),false);
  await page.locator('.personal-preferences>summary').click();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('.theme-toggle').click();
   await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`/tmp/spatial-published-${theme}.png`,fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'English',exact:true}).click();
  await page.reload();await page.getByText('Ready on your device',{exact:true}).waitFor({timeout:120000});
  assert.equal(await page.locator('#bit-depth').inputValue(),'16');assert.equal(await page.locator('#sample-rate').inputValue(),'44100');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await guarded(),false);
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);assert.deepEqual(remote,[]);
  console.log('PASS: public individual retry, mixed-format ZIP CRCs/size, mobile themes, saved preferences and no uploads or browser exceptions');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
