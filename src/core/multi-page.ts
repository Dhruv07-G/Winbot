import {parseMCQ, splitTraceQuestions} from './trace';
import type {Source} from './model';

export type BasketQuestion={id:number;number?:number;question:string;status:'pending'|'answered';answer?:string;error?:string;sources?:Source[]};
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
 const explicit=[...text.matchAll(/^\s*Q(?:uestion)?\s*\d{1,3}[.):-]\s*/gim)];
 // OCR commonly reads the Q in a heading as 0 ("03."). Mix both heading
 // forms within a frame instead of discarding numeric headings when a Q is seen.
 const numeric=[...text.matchAll(/^[ \t]*\(?0?\d{1,3}[.][ \t]+[^\n]*/gmu)]
  .filter(match=>/\b(?:what|which|who|where|when|why|how|find|calculate|compute|solve|select|identify)\b|[?？]|[\u0900-\u097f]{4,}/iu.test(match[0]));
 const headings=[...explicit,...numeric].sort((a,b)=>a.index!-b.index!);
 if(!headings.length)return splitTraceQuestions(text.trim()).filter(Boolean);
 const headingNumber=(heading:RegExpMatchArray|undefined)=>heading?Number(heading[0].match(/\d{1,3}/)?.[0]):undefined;
 return headings.map((heading,i)=>{
  let part=text.slice(heading.index!,i+1<headings.length?headings[i+1].index:text.length).trim();
  if(numeric.some(candidate=>candidate.index===heading.index)){
   let number=headingNumber(heading)!;
   // A stray "(2" in front of 6 can yield "(26.". Repair only when
   // the neighboring explicit numbers prove the missing ordinal.
   if(heading[0].trimStart().startsWith('(')){
    const suffix=Number(String(number).slice(1)),previous=headingNumber(headings[i-1]),next=headingNumber(headings[i+1]);
    if(previous!==undefined&&next!==undefined&&suffix===previous+1&&next===suffix+1)number=suffix;
   }
   part=part.replace(/^\(?0?\d{1,3}[.]/,`Q${number}.`);
  }
  return part;
 }).filter(Boolean);
}
export class QuestionBasket {
 private entries:BasketQuestion[]=[];private nextId=1;
 get questions(){return this.entries.map(entry=>({...entry}));}
 get pending(){return this.questions.filter(entry=>entry.status==='pending');}
 get answered(){return this.entries.filter(entry=>entry.status==='answered').length;}
 clear(){this.entries=[];this.nextId=1;}
  restore(entries:BasketQuestion[]){this.entries=entries.map(entry=>({...entry,sources:entry.sources?.map(source=>({...source}))}));this.nextId=Math.max(0,...entries.map(entry=>entry.id))+1;}
 addFrame(text:string){
  const added:BasketQuestion[]=[];
  for(const raw of splitPageQuestions(text)){
   const question=raw.trim().slice(0,10000),number=questionNumber(question);
   if(!question||(!number&&question.length<12))continue;
   const match=this.entries.find(old=>{
    if(number!==undefined&&old.number!==undefined&&number!==old.number)return false;
    const score=similarity(old.question,question);
    const stem=(value:string)=>value.split(/\n\s*(?:[a-hA-H]|[1-8])[.)]\s+/)[0];
    return number!==undefined&&old.number===number?similarity(stem(old.question),stem(question))>=0.5||score>=0.72:score>=0.84;
   });
   if(match){
    if(match.status==='pending'&&(question.length>match.question.length||parseMCQ(question).complete&&!parseMCQ(match.question).complete)){match.question=question;match.error=undefined;match.answer=undefined;}
    continue;
   }
   const entry:BasketQuestion={id:this.nextId++,number,question,status:'pending'};this.entries.push(entry);added.push({...entry});
  }
  this.entries.sort((a,b)=>a.number===undefined||b.number===undefined?a.id-b.id:a.number-b.number);
  return added;
 }
 setPartial(id:number,answer:string){const entry=this.entries.find(q=>q.id===id);if(entry&&entry.status==='pending')entry.answer=answer;}
  markAnswered(id:number,answer:string,sources:Source[]=[]){const entry=this.entries.find(q=>q.id===id);if(entry&&entry.status==='pending'){entry.status='answered';entry.answer=answer;entry.sources=sources;entry.error=undefined;}}
 markError(id:number,error:string){const entry=this.entries.find(q=>q.id===id);if(entry&&entry.status==='pending')entry.error=error;}
}
/** Identical downscaled frames end auto mode after one repeated capture. */
export class FrameEndDetector {
 private previous?:string;
 observe(fingerprint:string){const unchanged=this.previous===fingerprint;this.previous=fingerprint;return unchanged;}
 reset(){this.previous=undefined;}
}
export function frameFingerprint(bytes:Uint8Array){let hash=2166136261;for(let i=0;i<bytes.length;i++){hash^=bytes[i];hash=Math.imul(hash,16777619);}return String(bytes.length)+':'+String(hash>>>0);}

