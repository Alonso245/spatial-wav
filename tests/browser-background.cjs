// Raw CDP intentionally avoids Playwright's forced focus and disabled timer throttling.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const url=process.argv[2] || 'http://127.0.0.1:8080/';
const files=process.argv.slice(3);
const limit=Number(process.env.SPATIAL_BACKGROUND_LIMIT || 180000);
const hidden=process.env.SPATIAL_BACKGROUND_VISIBLE!=='1';
if(!files.length)throw new Error('Provide one or more local audio paths. A graphical DISPLAY is required.');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spatial-background-'));
 const chrome=spawn(process.env.CHROMIUM_PATH || '/usr/bin/chromium',['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{env:{...process.env,DISPLAY:process.env.DISPLAY||':88'},stdio:['ignore','ignore','pipe']});
 let socket;
 try{
  const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});chrome.once('exit',code=>reject(Error('Chrome exit '+code)));});
  socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r));let id=0;const pending=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}});
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,sessionId}));});
  async function tab(address){const {targetId}=await call('Target.createTarget',{url:address});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});return {targetId,sessionId};}
  const app=await tab(url);
  async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},app.sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let n=0;n<120;n++){
   const ready=await evaluate(`(()=>{document.querySelector('dialog[open] [data-choice="dark"]')?.click();return !!document.querySelector('#audio-file')&&!document.querySelector('#audio-file').disabled})()`);
   if(ready)break;if(n===119)throw Error('Engine not ready');await wait(1000);
  }
  await call('Target.activateTarget',{targetId:app.targetId});
  const doc=await call('DOM.getDocument',{},app.sessionId);
  const input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#audio-file'},app.sessionId);
  await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:files.map(p=>path.resolve(p))},app.sessionId);
  for(let n=0;n<100;n++){if(await evaluate(`!!document.querySelector('.convert-action')&&!document.querySelector('.convert-action').disabled`))break;await wait(100);}
  await evaluate(`document.querySelector('.convert-action').click()`);
  const other=await tab(new URL('icon.svg',url).href);
  if(hidden)await call('Target.activateTarget',{targetId:other.targetId});else await call('Target.activateTarget',{targetId:app.targetId});
  const started=Date.now();let last;
  while(Date.now()-started<limit){
   last=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.file-queue>li')];return {visibility:document.visibilityState,progress:document.querySelector('progress')?.value||0,ready:rows.length?rows.filter(r=>r.dataset.state==='ready').length:document.querySelector('.download-action')?1:0,message:document.querySelector('.message')?.textContent}})()`);
   if(hidden&&last.visibility!=='hidden')throw Error('Visibility was not actually hidden: '+JSON.stringify(last));
   if(last.ready===files.length){console.log(JSON.stringify({completed:true,hidden,elapsed:(Date.now()-started)/1000,...last}));return;}
   if(last.message?.startsWith('No se pudo') || last.message?.startsWith('Unable to convert') || last.message?.includes('could not start'))throw Error(last.message);
   if(Math.floor((Date.now()-started)/1000)%10===0)console.log(JSON.stringify({elapsed:(Date.now()-started)/1000,...last}));
   await wait(1000);
  }
  console.log(JSON.stringify({completed:false,hidden,elapsed:(Date.now()-started)/1000,...last}));
  if(!process.env.SPATIAL_BACKGROUND_OBSERVE)process.exitCode=1;
 }finally{socket?.close();const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');await exited;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
