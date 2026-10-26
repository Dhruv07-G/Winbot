import {FrameEndDetector,FrameReader,QuestionBasket,ScrollProvider,frameFingerprint,pause} from './multi-page';

export type CaptureMode='auto'|'watch';
export type CaptureProgress={mode:CaptureMode;pages:number;active:boolean;reason?:'done'|'unchanged'|'limit';questions:number;answered:number};
/** Platform-independent session coordinator. Image buffers are erased after OCR. */
export class MultiPageCapture {
 readonly basket=new QuestionBasket();
 private stopRequested=false;
 private detector=new FrameEndDetector();
 private seen=new Set<string>();
 private readings=new Set<Promise<void>>();
 private frameError?:unknown;
 progress:CaptureProgress={mode:'auto',pages:0,active:false,questions:0,answered:0};
 constructor(private scroll:ScrollProvider,private reader:FrameReader,private notify:(progress:CaptureProgress)=>void){}
 private publish(patch:Partial<CaptureProgress>={}){this.progress={...this.progress,...patch,questions:this.basket.questions.length,answered:this.basket.answered};this.notify({...this.progress});}
 done(){this.stopRequested=true;}
 async captureFrame(signal:AbortSignal){
  signal.throwIfAborted();
  // Three OCR workers are available; cap queued images to bound memory.
  if(this.readings.size>=3)await Promise.race(this.readings);
  const start=performance.now(),direct=await this.scroll.readText?.(signal);
  let bytes:Uint8Array|undefined;
  try{
   if(direct===null||direct===undefined)bytes=await this.scroll.capture(signal);
   const fingerprint=bytes?frameFingerprint(bytes):'text:'+direct!.trim();
   const unchanged=this.detector.observe(fingerprint);
   if(unchanged||this.seen.has(fingerprint))return {unchanged,duplicate:true,newQuestions:0};
   this.seen.add(fingerprint);
   const image=bytes;bytes=undefined;
   const task=(async()=>{
    try{
     const text=direct??await this.reader.extract(image!,signal);
     if(signal.aborted)return;
     const added=this.basket.addFrame(text);
     console.info('winbot:timing',JSON.stringify({stage:'multipage-frame',ms:Math.round(performance.now()-start),newQuestions:added.length}));
     this.publish();
    }catch(error){if(!signal.aborted)this.frameError=error;}
    finally{image?.fill(0);}
   })();
   this.readings.add(task);
   void task.finally(()=>this.readings.delete(task));
   return {unchanged:false,duplicate:false,newQuestions:0};
  }finally{bytes?.fill(0);}
 }
 async run(mode:CaptureMode,signal:AbortSignal,maxPages=40){
  if(this.progress.active)throw new Error('capture active');
  if(mode==='auto'&&!this.scroll.canAutoScroll())throw new Error('auto scroll unavailable');
  this.detector.reset();this.seen.clear();this.frameError=undefined;
  this.publish({mode,pages:0,active:true,reason:undefined});
  let sameWatch=0;
  try{
   while(!this.stopRequested&&this.progress.pages<maxPages){
    signal.throwIfAborted();
    const frame=await this.captureFrame(signal);
    if(mode==='auto'&&frame.unchanged){this.publish({reason:'unchanged'});break;}
    if(mode==='watch'&&frame.unchanged&&this.progress.pages>1&&++sameWatch>=5){this.publish({reason:'unchanged'});break;}
    if(!frame.unchanged&&!frame.duplicate){sameWatch=0;this.publish({pages:this.progress.pages+1});}
    if(this.stopRequested)break;
    if(mode==='auto'){await this.scroll.scrollNext(signal);await pause(300,signal);}
    else await pause(400,signal);
   }
   if(!this.progress.reason)this.publish({reason:this.stopRequested?'done':'limit'});
   await Promise.all(this.readings);
   if(this.frameError&&!this.basket.questions.length)throw this.frameError;
  }finally{await Promise.allSettled(this.readings);this.publish({active:false});await this.reader.close();}
  return this.basket.questions;
 }
}
