import { z } from "zod";
import { Settings, Source, languageOf, WinbotError } from "./model";
export const regionSchema = z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:z.number().finite().min(12),height:z.number().finite().min(12)}).strict();
export type Region = z.infer<typeof regionSchema>;
export type Choice = {label:string; text:string};
export type MCQ = {detected:boolean; complete:boolean; choices:Choice[]};
export type TraceItem = {index:number; question:string; text:string; status:"reading"|"searching"|"answering"|"streaming"|"done"|"error"|"cancelled"; sources:Source[]; error?:string; cached?:boolean; ms?:number};
/** Split explicit consecutive question numbers found within one traced selection. */
export function splitTraceQuestions(text:string):string[] {
  const headings=[...text.matchAll(/^[ \t]*Q(?:uestion)?[ \t]*(\d{1,2})[.):\-][ \t]*/gim)];
  if(headings.length<2||headings.length>16||headings.some((heading,i)=>i>0&&Number(heading[1])!==Number(headings[i-1][1])+1))return [text];
  const parts=headings.map((heading,i)=>text.slice(heading.index!,i+1<headings.length?headings[i+1].index:text.length).trim());
  return parts.every(part=>part.length>0)?parts:[text];
}
export function parseMCQ(text:string): MCQ {
  const letters = /(?:^|\n|\s{1,})(\([a-hA-H]\)|[a-hA-H][.)])\s+([^]*?)(?=(?:\s+(?:\([a-hA-H]\)|[a-hA-H][.)])\s+)|$)/g;
  const numbered = /(?:^|\n)\s*(\((?:[1-9]|i{1,3}|iv|v|vi{1,3})\)|(?:[1-9]|i{1,3}|iv|v|vi{1,3})[.)])\s+([^]*?)(?=\n\s*(?:\((?:[1-9]|i{1,3}|iv|v|vi{1,3})\)|(?:[1-9]|i{1,3}|iv|v|vi{1,3})[.)])\s+|$)/gi;
  let matches=[...text.matchAll(letters)];
  if(!matches.length) matches=[...text.matchAll(numbered)];
  const choices=matches.map(m=>({label:m[1].replace(/[().]/g,""),text:m[2].trim()}));
  const labels=choices.map(c=>c.label.toLowerCase());
  const sequences=[['a','b','c','d','e','f','g','h'],['1','2','3','4','5','6','7','8'],['i','ii','iii','iv','v','vi','vii','viii']];
  const complete=choices.length>=4&&choices.length<=8&&choices.every(c=>c.text.length>0)&&sequences.some(seq=>labels.every((l,i)=>l===seq[i]));
  return {detected:choices.length>0,complete,choices};
}
export const unclear=(language:string)=>language==='hi'?'अस्पष्ट – फिर से चुनें':'Unclear – re-trace';
export function formatTrace(index:number, mcq:MCQ, result:{label?:string;answer?:string;reason?:string;unclear?:boolean},settings:Settings,language:string):string {
  const prefix=`Q${index+1}: `;
  if(result.unclear||(mcq.detected&&!mcq.complete))return prefix+unclear(language);
  if(mcq.detected){
    const selected=mcq.choices.find(c=>c.label.toLowerCase()===result.label?.trim().toLowerCase());
    if(!selected)return prefix+unclear(language);
    return prefix+selected.label+') '+selected.text+(settings.traceMCQStyle!=='answer'&&result.reason?.trim()?'\n'+result.reason.trim():'');
  }
  return prefix+(result.answer?.trim()||unclear(language));
}
export interface RegionCaptureProvider { capture(region:Region,signal:AbortSignal):Promise<Uint8Array>; }
export interface TraceAnswerProvider { answerTrace(question:string,mcq:MCQ,sources:Source[],settings:Settings,language:string,signal:AbortSignal,onPartial:(result:any)=>void):Promise<any>; identity(settings:Settings):string; }
export interface TraceOCRProvider { extract(image:Uint8Array,signal:AbortSignal):Promise<string>; close():Promise<void>; }
export class TracePipeline {
  private cache=new Map<string,{at:number;result:any;sources:Source[]}>();
  clear(){this.cache.clear();}
  constructor(private p:{capture:RegionCaptureProvider;ocr:TraceOCRProvider;search:{search(q:string,l:string,s:AbortSignal):Promise<Source[]>};llm:TraceAnswerProvider}){}
  async run(regions:Region[],settings:Settings,signal:AbortSignal,emit:(item:TraceItem)=>void,prefetched:(Uint8Array|undefined)[]=[]){
    if(!settings.ocr)throw new WinbotError('ocrDisabled');
    if(!regions.length||regions.length>16)throw new WinbotError('traceRegions');
    const pending=new Map<string,Promise<{result:any;sources:Source[]}>>();
    const start=performance.now();
    const items:TraceItem[]=[];
    const measure=(index:number,stage:string,at:number)=>console.info('winbot:timing',JSON.stringify({q:index+1,stage,ms:Math.round(performance.now()-at)}));
    const answerQuestion=async(item:TraceItem,index:number):Promise<TraceItem>=>{
      const update=(patch:Partial<TraceItem>)=>{if(!signal.aborted){Object.assign(item,patch);emit({...item});}};
      try{
        signal.throwIfAborted();
        const language=languageOf(settings,item.question),mcq=parseMCQ(item.question);
        if(!item.question||mcq.detected&&!mcq.complete){
          update({status:'done',text:'Q'+(index+1)+': '+unclear(language),ms:Math.round(performance.now()-start)});
          return item;
        }
        const key=JSON.stringify([item.question.replace(/\s+/g,' '),settings.traceSearch,settings.traceMCQStyle,settings.traceTextStyle,language,this.p.llm.identity(settings)]);
        const saved=this.cache.get(key);
        let value:{result:any;sources:Source[]};
        if(saved&&Date.now()-saved.at<120000){value=saved;item.cached=true;}
        else{
          let job=pending.get(key);
          if(!job){
            job=(async()=>{
              update({status:settings.traceSearch?'searching':'answering'});
              let at=performance.now();
              const sources=settings.traceSearch?await this.p.search.search(item.question,language,signal):[];
              measure(index,'search',at);
              signal.throwIfAborted();update({status:'answering',sources});
              at=performance.now();let first=true;
              const result=await this.p.llm.answerTrace(item.question,mcq,sources,settings,language,signal,partial=>{
                if(first){measure(index,'first-token',at);first=false;}
                update({status:'streaming',text:formatTrace(index,mcq,partial,settings,language)});
              });
              measure(index,'llm',at);signal.throwIfAborted();
              const completed={result,sources};
              if(!result.unclear){
                this.cache.set(key,{...completed,at:Date.now()});
                while(this.cache.size>50)this.cache.delete(this.cache.keys().next().value!);
              }
              return completed;
            })();
            pending.set(key,job);
          }
          value=await job;
        }
        signal.throwIfAborted();
        update({status:'done',sources:value.sources,text:formatTrace(index,mcq,value.result,settings,language),ms:Math.round(performance.now()-start)});
        measure(index,'display-ready',start);
      }catch(error){
        if(!signal.aborted)update({status:'error',error:error instanceof WinbotError?error.code:'apiFailure',text:''});
      }
      return item;
    };
    // Capture/OCR starts for every region immediately. Results are numbered only
    // after earlier regions reveal whether they contain multiple questions.
    const readings=regions.map(async(region,index)=>{
      let image:Uint8Array|undefined=prefetched[index];
      try{
        signal.throwIfAborted();let at=performance.now();
        if(!image)image=await this.p.capture.capture(region,signal);
        measure(index,'capture',at);
        signal.throwIfAborted();at=performance.now();
        const question=(await this.p.ocr.extract(image,signal)).trim().slice(0,10000);
        measure(index,'ocr',at);
        return {question};
      }catch(error){
        return {error:error instanceof WinbotError?error.code:'apiFailure'};
      }finally{image?.fill(0);}
    });
    try{
      const answers:Promise<TraceItem>[]=[];
      for(const reading of readings){
        const result=await reading;
        if(signal.aborted)continue;
        if('error' in result){
          const item:TraceItem={index:items.length,question:'',text:'',status:'error',sources:[],error:result.error};
          items.push(item);emit({...item});continue;
        }
        const questions=splitTraceQuestions(result.question);
        if(questions.length>1)console.info('winbot:timing',JSON.stringify({stage:'split-questions',count:questions.length}));
        for(const question of questions){
          const item:TraceItem={index:items.length,question,text:'',status:'reading',sources:[]};
          items.push(item);emit({...item});
          answers.push(answerQuestion(item,item.index));
        }
      }
      await Promise.all(answers);
      return items;
    }finally{await Promise.all(readings);await this.p.ocr.close();}
  }
}
