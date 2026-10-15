import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
const image=process.argv[2];
if(!image)throw new Error('Usage: node scripts/test-ocr.mjs <synthetic bilingual PNG> [model directory]');
const require=createRequire(process.argv[4]?path.resolve(process.argv[4],'package.json'):import.meta.url);
const {createWorker}=require('tesseract.js');
const worker=await createWorker(['eng','hin'],1,{cachePath:path.resolve('../../work/ocr'),cacheMethod:process.argv[3]?'none':'write',...(process.argv[3]?{langPath:process.argv[3]}:{})});
try{
 const {data}=await worker.recognize(image);
 assert.match(data.text,/capital of India/i);
 assert.match(data.text,/भारत/);
 assert.match(data.text,/राजधानी/);
 console.log('PASS: real English and Hindi OCR on synthetic image');
}finally{await worker.terminate();}
