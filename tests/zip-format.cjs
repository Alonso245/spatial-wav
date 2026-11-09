// Cross-reader regression for the streaming ZIP64 writer. Uses Node, Python, and no npm packages.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
global.window=globalThis;
require('../src/AtmosWeb/wwwroot/cooperate.js');
require('../src/AtmosWeb/wwwroot/zip.js');
(async()=>{
 const chunks=[];
 const entries=[
  {name:'crc.txt',data:new Blob(['123456789'])},
  {name:'vacío.txt',data:new Blob([])},
  {name:'canción.txt',data:new Blob(['prueba de UTF-8'])}
 ];
 await spatialZip.build(entries,{write:async bytes=>chunks.push(bytes)});
 assert.equal(spatialZip.measure(entries.map(({name,data})=>({name,size:data.size}))),Buffer.concat(chunks).length);
 assert.throws(()=>spatialZip.measure([{name:'bad',size:-1}]));
 const path='/tmp/spatial-zip-format-test.zip';fs.writeFileSync(path,Buffer.concat(chunks));
 const verify=`import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nassert z.getinfo('crc.txt').CRC==0xcbf43926\nassert z.getinfo('vacío.txt').CRC==0\nassert z.read('canción.txt').decode()=='prueba de UTF-8'\nassert all(i.extract_version==45 and i.compress_type==zipfile.ZIP_STORED for i in z.infolist())`;
 execFileSync('python3',['-c',verify,path]);
 let stopped=false,writes=0;
 await assert.rejects(()=>spatialZip.build([{name:'cancel.bin',data:new Blob(['cancel'])}],{write:async()=>{writes++;stopped=true;}},{cancelled:()=>stopped}),{name:'AbortError'});
 assert.equal(writes,1);
 console.log('PASS: ZIP64 round trip, known CRC32, empty entry, Unicode and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
