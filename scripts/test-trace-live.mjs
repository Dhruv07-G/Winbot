// Synthetic-image Trace regression. No desktop capture; uses one configured model request.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import dotenv from 'dotenv';
const root=process.cwd();
const profile=path.join(process.env.APPDATA||'', 'winbot', '.env');
const portable=path.join(root,'release','portable-win-x64','.env');
const envPath=await fs.access(profile).then(()=>profile,()=>portable);
dotenv.config({path:envPath,quiet:true});
if(!process.env.OPENAI_API_KEY)throw new Error('Configured AI key not found');
process.env.TESSDATA_PATH=path.join(root,'local-models');
const cache=path.join(root,'node_modules','.cache','winbot-tests');
const fixture=path.join(root,'tests','fixtures','trace-mcq.png');
await fs.access(fixture);
await build({entryPoints:['scripts/trace-live-entry.ts'],outfile:path.join(cache,'trace-live-entry.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
const require=createRequire(import.meta.url);
const {TracePipeline,TraceOCR,TraceLLM,defaults,trustWindowsCertificates}=require(path.join(cache,'trace-live-entry.cjs'));
trustWindowsCertificates();
const settings={...defaults,traceSearch:false,traceMCQStyle:'answer',language:'en'};
const provider=new TraceLLM();
const pipeline=new TracePipeline({
  capture:{capture:async()=>new Uint8Array(await fs.readFile(fixture))},
  ocr:new TraceOCR(),
  llm:provider,
  search:{search:async()=>{throw new Error('Search must stay disabled for this regression');}},
});
const events=[];
const started=performance.now();
const [answer]=await pipeline.run([{x:0,y:0,width:700,height:260}],settings,AbortSignal.timeout(90000),item=>events.push({status:item.status,text:item.text}));
assert.equal(answer.status,'done',answer.error||'Trace failed');
assert.match(answer.question,/C\) Mitochondrion/);
assert.equal(answer.text,'Q1: C) Mitochondrion');
assert.ok(events.some(e=>e.status==='streaming'));
console.log(JSON.stringify({result:'PASS',answer:answer.text,elapsedMs:Math.round(performance.now()-started),streamed:true}));


