import { createWorker } from 'tesseract.js';
import { WinbotError } from '../core/model';
import type { TraceOCRProvider } from '../core/trace';
/** Batch-scoped pool: warm while tracing, parallel OCR, destroy image memory at batch end. */
export class TraceOCR implements TraceOCRProvider {
  private workers:Promise<Awaited<ReturnType<typeof createWorker>>>[]=[];
  private tails:Promise<unknown>[]=[];
  private next=0;
  warm(count=3){
    if(this.workers.length)return;
    this.workers=Array.from({length:Math.min(3,count)},()=>createWorker(['eng','hin'],1,{...(process.env.TESSDATA_PATH?{langPath:process.env.TESSDATA_PATH}:{}),cacheMethod:'none'}));
    this.workers.forEach(p=>void p.catch(()=>{}));this.tails=this.workers.map(()=>Promise.resolve());
  }
  async extract(image:Uint8Array,signal:AbortSignal){
    this.warm();const index=this.next++%this.workers.length;
    const job=this.tails[index].catch(()=>{}).then(async()=>{
      signal.throwIfAborted();const worker=await this.workers[index];signal.throwIfAborted();
      const abort=()=>{void worker.terminate().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
      try {const result=await worker.recognize(Buffer.from(image));signal.throwIfAborted();return result.data.text;}
      finally{signal.removeEventListener('abort',abort);}
    });this.tails[index]=job;
    try{return await job;}catch(e){if(signal.aborted)throw e;throw new WinbotError('ocrFailure');}
  }
  async close(){const workers=this.workers;this.workers=[];this.tails=[];this.next=0;await Promise.allSettled(workers.map(async p=>(await p).terminate()));}
}
