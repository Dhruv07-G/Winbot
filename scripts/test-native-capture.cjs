const fs=require('node:fs'),path=require('node:path');const {Worker}=require('node:worker_threads');
const workerPath=path.resolve('release/portable-win-x64/resources/app/dist-desktop/region-worker.cjs');
let code=fs.readFileSync(workerPath,'utf8');
// Exercise native GDI and worker transfer on an allocated memory bitmap only.
// Never copy pixels from the desktop during this diagnostic.
const source=/BitBlt\(mem,\s*0,\s*0,\s*r\.width,\s*r\.height,\s*dc,\s*r\.x,\s*r\.y,/g;
if([...code.matchAll(source)].length!==1)throw Error('Synthetic source guard failed; refusing to run');
code=code.replace(source,'BitBlt(mem, 0, 0, r.width, r.height, mem, 0, 0,');
code=code.replace(/require\("koffi"\)/g,`require(${JSON.stringify(path.resolve('release/portable-win-x64/resources/app/node_modules/koffi'))})`);
const worker=new Worker(code,{eval:true,workerData:{x:0,y:0,width:32,height:32}});
const timer=setTimeout(()=>{console.error('FAIL worker timeout');worker.terminate();process.exitCode=1;},15000);
worker.on('error',e=>{console.error('FAIL worker loading:',e.message);process.exitCode=1;});
worker.on('message',message=>{if(message.error){console.error('FAIL',message.error);process.exitCode=1;}else{console.log('PASS native memory-bitmap copy/read/worker transfer:',message.bytes.length,'bytes');message.bytes.fill(0);}});
worker.on('exit',code=>{clearTimeout(timer);if(code)process.exitCode=1;});
