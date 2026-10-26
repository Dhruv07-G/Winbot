import {parseMCQ, splitTraceQuestions} from './trace';

export type BasketQuestion={id:number;number?:number;question:string;status:'pending'|'answered';answer?:string;error?:string};
export interface ScrollProvider {
 canAutoScroll():boolean;
 scrollNext(signal:AbortSignal):Promise<void>;
 capture(signal:AbortSignal):Promise<Uint8Array>;
 /** A browser/PDF adapter may provide selectable source text without OCR. */
 readText?(signal:AbortSignal):Promise<string|null>;
}
export interface FrameReader {extract(image:Uint8Array,signal:AbortSignal):Promise<string>;close():Promise<void>}
export const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
 if(signal.aborted){reject(signal.reason);return;}
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
});
const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/^\s*(?:q(?:uestion)?\s*)?\d{1,3}[.):-]\s*/i,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function grams(text:string){const value='  '+normalize(text)+'  ';const out=new Map<string,number>();for(let i=0;i<value.length-2;i++){const key=value.slice(i,i+3);out.set(key,(out.get(key)||0)+1);}return out;}
export function similarity(a:string,b:string){const x=grams(a),y=grams(b);let shared=0,size=0;for(const [key,count] of x){size+=count;shared+=Math.min(count,y.get(key)||0);}for(const count of y.values())size+=count;return size?2*shared/size:1;}
export function questionNumber(text:string){const found=text.match(/^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.):-]\s*/i);return found?Number(found[1]):undefined;}
/** OCR can miss an intervening heading, so split on all explicit Q headings. */
export function splitPageQuestions(text:string){
 const headings=[...text.matchAll(/^\s*Q(?:uestion)?\s*\d{1,3}[.):-]\s*/gim)];
 if(headings.length<2)return splitTraceQuestions(text.trim()).filter(Boolean);
 return headings.map((heading,i)=>text.slice(heading.index!,i+1<headings.length?headings[i+1].index:text.length).trim()).filter(Boolean);
}
export class QuestionBasket {
 private entries:BasketQuestion[]=[];private nextId=1;
 get questions(){return this.entries.map(entry=>({...entry}));}
 get pending(){return this.questions.filter(entry=>entry.status==='pending');}
 get answered(){return this.entries.filter(entry=>entry.status==='answered').length;}
 clear(){this.entries=[];this.nextId=1;}
 addFrame(text:string){
  const added:BasketQuestion[]=[];
  for(const raw of splitPageQuestions(text)){
   const question=raw.trim().slice(0,10000),number=questionNumber(question);
   if(!question||(!number&&question.length<12))continue;
   const match=this.entries.find(old=>{
    if(number!==undefined&&old.number!==undefined&&number!==old.number)return false;
    const score=similarity(old.question,question);
    const stem=(value:string)=>value.split(/\n\s*(?:[a-hA-H]|[1-8])[.)]\s+/)[0];
    return number!==undefined&&old.number===number?similarity(stem(old.question),stem(question))>=0.65:score>=0.84;
   });
   if(match){
    if(match.status==='pending'&&(question.length>match.question.length||parseMCQ(question).complete&&!parseMCQ(match.question).complete))match.question=question;
    continue;
   }
   const entry:BasketQuestion={id:this.nextId++,number,question,status:'pending'};this.entries.push(entry);added.push({...entry});
  }
  this.entries.sort((a,b)=>a.number===undefined||b.number===undefined?a.id-b.id:a.number-b.number);
  return added;
 }
 markAnswered(id:number,answer:string){const entry=this.entries.find(q=>q.id===id);if(entry&&entry.status==='pending'){entry.status='answered';entry.answer=answer;entry.error=undefined;}}
 markError(id:number,error:string){const entry=this.entries.find(q=>q.id===id);if(entry&&entry.status==='pending')entry.error=error;}
}
/** Identical downscaled frames end auto mode after one repeated capture. */
export class FrameEndDetector {
 private previous?:string;
 observe(fingerprint:string){const unchanged=this.previous===fingerprint;this.previous=fingerprint;return unchanged;}
 reset(){this.previous=undefined;}
}
export function frameFingerprint(bytes:Uint8Array){let hash=2166136261;const step=Math.max(1,Math.floor(bytes.length/2048));for(let i=0;i<bytes.length;i+=step){hash^=bytes[i];hash=Math.imul(hash,16777619);}return String(bytes.length)+':'+String(hash>>>0);}

