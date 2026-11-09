// Browser API failure cases without OS prompts or external dependencies.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/AtmosWeb/wwwroot/preferences.js','utf8');
function setup({permission='default',stored={},blocked=false,unsupported=false,reject=false,fail=false}={}){
 const events=new Map(),changes=[];let calls=0,notices=0;
 const context={isSecureContext:true,URL,console,document:{baseURI:'https://example.test/spatial/',addEventListener:(name,fn)=>events.set('document:'+name,fn)},
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
  localStorage:{getItem:key=>{if(blocked)throw Error('Storage blocked');return stored[key]??null;},setItem:(key,value)=>{if(blocked)throw Error('Storage full');stored[key]=value;}},
  Notification:unsupported?undefined:class {static permission=permission;static async requestPermission(){calls++;if(reject)throw Error('Permission unavailable');return this.permission='granted';}constructor(){if(fail)throw Error('Delivery unavailable');notices++;}},
 };
 context.window=context;vm.runInNewContext(source,context);
 const bridge={invokeMethodAsync:async(name,state)=>changes.push(state)};
 return {api:context.spatialPreferences,load:()=>context.spatialPreferences.load(bridge),events,changes,stored,calls:()=>calls,notices:()=>notices,
  click:async()=>{events.get('document:click')({target:{closest:()=>({disabled:false})}});for(let i=0;i<5;i++)await Promise.resolve();}};
}
(async()=>{
 const unsupported=setup({unsupported:true});assert.equal(unsupported.load().notice.supported,false);await unsupported.click();assert.equal(unsupported.calls(),0);assert.equal(unsupported.api.complete('es',1,0),false);
 const denied=setup({permission:'denied',stored:{'spatial-notify-v1':'1'}});assert.equal(denied.load().notice.enabled,false);await denied.click();assert.equal(denied.calls(),0);
 const blocked=setup({blocked:true});const defaults=blocked.load();assert.equal(defaults.persistent,false);assert.equal(defaults.bitDepth,32);assert.equal(defaults.sampleRate,48000);assert.equal(blocked.api.saveExport(16,44100),false);
 const remembered=setup({permission:'granted',stored:{'spatial-notify-v1':'1'}});assert.equal(remembered.load().notice.enabled,true);assert.equal(remembered.api.complete('en',2,1),true);assert.equal(remembered.calls(),0);assert.equal(remembered.notices(),1);await remembered.click();assert.equal(remembered.api.complete('en',2,1),false);
 const rejected=setup({reject:true});rejected.load();await rejected.click();assert.equal(rejected.changes.at(-1).problem,'failed');assert.equal(rejected.changes.at(-1).requesting,false);
 const failed=setup({permission:'granted',stored:{'spatial-notify-v1':'1'},fail:true});failed.load();assert.equal(failed.api.complete('es',1,0),false);assert.equal(failed.changes.at(-1).enabled,false);assert.equal(failed.stored['spatial-notify-v1'],'0');
 const warning=setup();warning.load();warning.api.setActivity('conversion',true);warning.api.setActivity('archive',true);assert.ok(warning.events.has('beforeunload'));warning.api.setActivity('conversion',false);assert.ok(warning.events.has('beforeunload'));warning.api.setActivity('archive',false);assert.equal(warning.events.has('beforeunload'),false);
 console.log('PASS: denied/unsupported notifications, rejected permission, failed delivery, persisted opt-in, blocked storage and overlapping activity cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
