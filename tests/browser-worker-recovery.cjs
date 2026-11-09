// Worker bootstrap failures must be recoverable without losing selected input files.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const blocked of ['**/converter-worker.js*','**/_framework/dotnet.js']){
   const context=await browser.newContext({locale:'es-PE',acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8080/');await page.getByRole('dialog').getByRole('button',{name:/^Modo noche/}).click();
   await page.getByText('Listo en tu dispositivo').waitFor({timeout:120000});
   await context.route(blocked,route=>route.abort('failed'));
   await page.locator('input[type=file]').setInputFiles('/tmp/spatial-night-sample.ec3');
   await page.locator('.convert-action').click();
   await page.getByRole('status').filter({hasText:'No se pudo iniciar el motor en segundo plano'}).waitFor({timeout:120000});
   assert.equal(await page.locator('.download-action').count(),0);assert.equal(await page.locator('#blazor-error-ui').isVisible(),false);
   await context.unroute(blocked);await page.locator('.convert-action').click();
   await page.locator('.download-action').waitFor({timeout:120000});
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.download-action').click()]);
   await download.saveAs('/tmp/spatial-recovered-worker.wav');
   await page.getByRole('button',{name:'Nueva conversión'}).click();await page.locator('.convert-action').waitFor();
   assert.deepEqual(errors,[]);
   await context.close();console.log('PASS: recoverable bootstrap failure '+blocked);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
