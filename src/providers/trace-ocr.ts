import { createWorker, PSM } from 'tesseract.js';
import { WinbotError } from '../core/model';
import {questionNumber,splitPageQuestions} from '../core/multi-page';
import { parseMCQ, type TraceOCRProvider } from '../core/trace';
// Known OCR punctuation artifact: C) can be emitted as CQ). Retain the
// observed C, and accept cleanup only when all four A/B/C/D labels are present.
function cleanOneQuestion(text:string){
  if(parseMCQ(text).complete)return text;
  const candidate=text.replace(/^(\s*)CQ\)(?=\s)/gm,'$1C)');
  const parsed=parseMCQ(candidate);
  return parsed.complete&&parsed.choices.length===4&&parsed.choices.map(c=>c.label).join('')==='ABCD'?candidate:text;
}
export function cleanOCRChoices(text:string){
  return splitPageQuestions(text).map(cleanOneQuestion).join('\n\n');
}
function needsRetry(text:string){
  return splitPageQuestions(text).some(part=>{const choices=parseMCQ(part);return choices.detected&&!choices.complete;});
}
function mergeReadings(first:string,second:string){
  if(!first.trim())return second;
  const original=splitPageQuestions(first),retry=splitPageQuestions(second);
  if(original.length!==retry.length)return first;
  return original.map((part,i)=>{
    const old=parseMCQ(part),fresh=parseMCQ(retry[i]);
    return questionNumber(part)===questionNumber(retry[i])&&old.detected&&!old.complete&&fresh.complete?retry[i]:part;
  }).join('\n\n');
}
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
      let englishOnly=false;
      try {
        await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
        const result=await worker.recognize(Buffer.from(image));signal.throwIfAborted();
        const first=cleanOCRChoices(result.data.text);
        if(first.trim()&&!needsRetry(first))return first;
        // Re-read pixels, never infer a missing label from its position.
        try{
          if(!/[\u0900-\u097f]/.test(first)){englishOnly=true;await worker.reinitialize('eng');}
          signal.throwIfAborted();
          await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
          const retry=await worker.recognize(Buffer.from(image));signal.throwIfAborted();
          const second=cleanOCRChoices(retry.data.text);
          return mergeReadings(first,second);
        }catch(error){if(signal.aborted)throw error;return first;}
      }
      finally{
        signal.removeEventListener('abort',abort);
        if(englishOnly&&!signal.aborted)await worker.reinitialize('eng+hin');
      }
    });this.tails[index]=job;
    try{return await job;}catch(e){if(signal.aborted)throw e;throw new WinbotError('ocrFailure');}
  }
  async close(){const workers=this.workers;this.workers=[];this.tails=[];this.next=0;await Promise.allSettled(workers.map(async p=>(await p).terminate()));}
}
