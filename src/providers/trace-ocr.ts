import { createWorker, PSM } from 'tesseract.js';
import { WinbotError } from '../core/model';
import {questionNumber,splitPageQuestions} from '../core/multi-page';
import { parseMCQ, type TraceOCRProvider } from '../core/trace';
// Known OCR punctuation artifact: C) can be emitted as CQ). Retain the
// observed C, and accept cleanup only when all four A/B/C/D labels are present.
function repairCompactLine(line:string){
  if(!/^\s*A[.)]/i.test(line))return line;
  const parts=line.split(/\s*(?:[·•–—]|-(?=\s*(?:[A-D][.)]?|0C|OC|O[.)]|0[.)]|8[.)]|©[.)])))\s*/i);
  if(parts.length!==4)return line;
  const labels=[/^A[.)]/i,/^(?:B[.)]|B(?=\d)|8[.)])/i,/^(?:C[.)]|C(?=\d)|0C(?=\d)|OC(?=\d)|O[.)]|0[.)]|©[.)])/i,/^(?:D[.)]|D(?=\d)|O[.)]|0[.)])/i];
  const strong=parts.filter((part,i)=>new RegExp('^'+String.fromCharCode(65+i)+'(?:[.)]|(?=\\d))','i').test(part.trim())).length;
  if(strong<3)return line;
  const values=parts.map((part,i)=>part.trim().replace(labels[i],'').trim());
  if(values.some(value=>!value))return line;
  return values.map((value,i)=>String.fromCharCode(65+i)+') '+value).join('\n');
}
function cleanOneQuestion(text:string){
  if(parseMCQ(text).complete)return text;
  const compact=text.split('\n').map(repairCompactLine).join('\n');
  if(parseMCQ(compact).complete)return compact;
  const candidate=compact.replace(/^(\s*)CQ\)(?=\s)/gm,'$1C)');
  const parsed=parseMCQ(candidate);
  return parsed.complete&&parsed.choices.length===4&&parsed.choices.map(c=>c.label).join('')==='ABCD'?candidate:text;
}
export function cleanOCRChoices(text:string){
  return splitPageQuestions(text).map(cleanOneQuestion).join('\n\n');
}
function needsRetry(text:string){
  return splitPageQuestions(text).some(part=>{const choices=parseMCQ(part);return choices.detected&&!choices.complete;});
}
function mergeReadings(first:string,second:string,includePartial=false){
  if(!first.trim())return second;
  const original=splitPageQuestions(first),retry=splitPageQuestions(second);
  const merged=new Map<number,string>();
  const numbers=original.map(questionNumber).filter((number):number is number=>number!==undefined);
  const min=Math.min(...numbers),max=Math.max(...numbers);
  for(const part of original){const number=questionNumber(part);if(number!==undefined)merged.set(number,part);}
  for(const part of retry){
    const number=questionNumber(part);if(number===undefined)continue;
    const old=merged.get(number),fresh=parseMCQ(part);
    if(!old){if(fresh.complete||includePartial&&fresh.detected&&number>=min-1&&number<=max+1)merged.set(number,part);continue;}
    if(parseMCQ(old).complete||!fresh.complete)continue;
    // English OCR often reads option labels better, but loses a Hindi stem.
    const firstOption=old.search(/(?:^|\n)\s*A[.)]/i),retryOption=part.search(/(?:^|\n)\s*A[.)]/i);
    if(/[\u0900-\u097f]/.test(old)&&!/[\u0900-\u097f]/.test(part)&&firstOption>=0&&retryOption>=0){
      merged.set(number,old.slice(0,firstOption).trimEnd()+'\n'+part.slice(retryOption).trimStart());
    }else merged.set(number,part);
  }
  if(merged.size)return [...merged].sort((a,b)=>a[0]-b[0]).map(([,part])=>part).join('\n\n');
  if(original.length!==retry.length)return first;
  return original.map((part,i)=>{
    const old=parseMCQ(part),fresh=parseMCQ(retry[i]);
    return old.detected&&!old.complete&&fresh.complete?retry[i]:part;
  }).join('\n\n');
}
/** Batch-scoped pool: warm while tracing, parallel OCR, destroy image memory at batch end. */
export class TraceOCR implements TraceOCRProvider {
  constructor(private readonly pageMode=false){}
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
        await worker.setParameters({tessedit_pageseg_mode:this.pageMode?PSM.SINGLE_BLOCK:PSM.AUTO});
        const result=await worker.recognize(Buffer.from(image));signal.throwIfAborted();
        const first=cleanOCRChoices(result.data.text);
        const firstHeading=result.data.text.search(/^\s*Q\d{1,3}[.):-]/m);
        const orphanPrefix=this.pageMode&&firstHeading>0&&result.data.text.slice(0,firstHeading).trim().length>=12;
        if(first.trim()&&!needsRetry(first)&&!orphanPrefix)return first;
        // Re-read pixels, never infer a missing label from its position.
        try{
          if(this.pageMode||!/[\u0900-\u097f]/.test(first)){englishOnly=true;await worker.reinitialize('eng');}
          signal.throwIfAborted();
          await worker.setParameters({tessedit_pageseg_mode:this.pageMode?PSM.SINGLE_BLOCK:PSM.SPARSE_TEXT});
          const retry=await worker.recognize(Buffer.from(image));signal.throwIfAborted();
          const second=cleanOCRChoices(retry.data.text);
          return mergeReadings(first,second,this.pageMode);
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
