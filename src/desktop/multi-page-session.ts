import {app,BrowserWindow,screen} from 'electron';
import type {Display} from 'electron';
import {MultiPageCapture,type CaptureMode} from '../core/multi-page-capture';
import {QuestionBasket,type ScrollProvider} from '../core/multi-page';
import {formatTrace,parseMCQ,type Region} from '../core/trace';
import {languageOf,type Settings,WinbotError} from '../core/model';
import {TraceOCR} from '../providers/trace-ocr';
import {TraceLLM} from '../providers/trace-llm';
import {createSearchProvider} from '../providers';
import {captureRegion} from './region-capture';
import {scrollUnderlying} from './native-scroll';

export class DesktopMultiPageSession {
 private capture?:MultiPageCapture;
 private abort?:AbortController;
 private badge?:BrowserWindow;
 private mode?:CaptureMode;
 private answering=false;
 private pages=0;
 private reason?:string;
 private pending?:Promise<void>;
 private settings?:Settings;
 private target?:{x:number;y:number};
 private badgeOverlaps=false;
 constructor(private hooks:{assert:()=>void;capturing:(active:boolean)=>void;changed:()=>void;showPanel:()=>void;hidePanel:()=>void;error:(code:string)=>void}){}
 get state(){return {active:!!this.capture?.progress.active,answering:this.answering,mode:this.mode,pages:this.pages,reason:this.reason,basket:this.capture?.basket.questions||[]};}
 get busy(){return !!this.pending||!!this.capture?.progress.active||this.answering;}
 private update(){const progress=this.capture?.progress;this.pages=progress?.pages||this.pages;this.reason=progress?.reason;this.hooks.changed();if(this.badge&&!this.badge.isDestroyed()){const count=this.capture?.basket.questions.length||0;this.badge.setTitle('Winbot Capturing - '+count+' questions');void this.badge.webContents.executeJavaScript('document.getElementById("count").textContent='+JSON.stringify(String(count))).catch(()=>{});}}
 private async showBadge(display:Display,region:Region){
  const width=260,height=44,area=display.workArea;
  const left={x:area.x+12,y:area.y+12},right={x:area.x+area.width-width-12,y:area.y+12};
  const overlaps=(p:{x:number;y:number})=>p.x<display.bounds.x+region.x+region.width&&p.x+width>display.bounds.x+region.x&&p.y<display.bounds.y+region.y+region.height&&p.y+height>display.bounds.y+region.y;
  const pos=!overlaps(left)?left:!overlaps(right)?right:{x:right.x,y:area.y+area.height-height-12};this.badgeOverlaps=overlaps(pos);
  const badge=new BrowserWindow({...pos,width,height,frame:false,transparent:false,backgroundColor:'#145a98',alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  badge.setMenu(null);badge.setAlwaysOnTop(true,'screen-saver');
  badge.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  badge.webContents.on('will-navigate',(event,url)=>{event.preventDefault();if(url==='https://winbot.invalid/done')this.done();if(url==='https://winbot.invalid/next')void this.nextPage().catch(()=>this.hooks.error('traceScrollUnsupported'));});
  const hindi=languageOf(this.settings!,'',app.getLocale())==='hi';
  const next=this.mode==='watch'?'<a style="color:white" href="https://winbot.invalid/next">'+(hindi?'अगला':'Next')+'</a> &nbsp; ':'';
  await badge.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;color:white;background:#145a98;font:14px system-ui">● '+(hindi?'कैप्चर जारी':'Capturing')+' · <span id="count">0</span> Q &nbsp; '+next+'<a style="color:white" href="https://winbot.invalid/done">'+(hindi?'पूरा':'Done')+'</a></body>'));
  badge.showInactive();this.badge=badge;this.update();
 }
 private closeBadge(){if(this.badge&&!this.badge.isDestroyed())this.badge.destroy();this.badge=undefined;}
 async start(mode:CaptureMode,region:Region,display:Display,settings:Settings){
  this.hooks.assert();if(this.busy)throw new WinbotError('multiBusy');if(!settings.ocr)throw new WinbotError('ocrDisabled');
  if(mode==='auto'&&process.platform==='linux'&&process.env.XDG_SESSION_TYPE==='wayland')throw new WinbotError('traceScrollUnsupported');
  this.mode=mode;this.settings={...settings};this.abort=new AbortController();this.reason=undefined;this.pages=0;
  this.target={x:Math.round(display.bounds.x+region.x+region.width/2),y:Math.round(display.bounds.y+region.y+region.height/2)};
  const signal=this.abort.signal,reader=new TraceOCR(true);
  reader.warm();
  const provider:ScrollProvider={
   canAutoScroll:()=>process.platform!=='linux'||process.env.XDG_SESSION_TYPE!=='wayland',
   scrollNext:async nextSignal=>{this.hooks.assert();nextSignal.throwIfAborted();scrollUnderlying('down',process.platform==='win32'?screen.dipToScreenPoint(this.target!):undefined);},
   capture:async nextSignal=>{this.hooks.assert();this.hooks.capturing(true);if(this.badgeOverlaps){this.badge?.hide();await new Promise(resolve=>setTimeout(resolve,80));}
    try{return await captureRegion(region,display,nextSignal,{maxDimension:1200});}
    finally{if(this.badgeOverlaps&&this.badge&&!this.badge.isDestroyed())this.badge.showInactive();this.hooks.capturing(false);}}
  };
  const basket=this.capture?.basket||new QuestionBasket();
  this.capture=new MultiPageCapture(provider,reader,()=>this.update());
  this.capture.basket.restore(basket.questions);
  this.hooks.hidePanel();
  try{await this.showBadge(display,region);}
  catch(error){this.hooks.showPanel();await reader.close();throw error;}
  this.pending=(async()=>{
   try{
    await new Promise(resolve=>setTimeout(resolve,150));
    await this.capture!.run(mode,signal,40);
    if(signal.aborted)return;
    if(!this.capture!.basket.questions.length)throw new WinbotError('noText');
    this.closeBadge();this.hooks.showPanel();this.answering=true;this.update();
    await this.answerPending(signal);
   }catch(error){if(!signal.aborted)this.hooks.error(error instanceof WinbotError?error.code:'capture');}
   finally{this.answering=false;this.closeBadge();this.hooks.showPanel();this.hooks.capturing(false);this.pending=undefined;this.update();}
  })();
 }
 done(){this.capture?.done();}
 async nextPage(){if(this.mode!=='watch'||!this.capture?.progress.active)return;this.hooks.assert();scrollUnderlying('down',process.platform==='win32'?screen.dipToScreenPoint(this.target!):undefined);}
 private async answerPending(signal:AbortSignal){
  const settings=this.settings!,llm=new TraceLLM();
  const pending=this.capture!.basket.pending;
  for(let offset=0;offset<pending.length;offset+=6){
   signal.throwIfAborted();
   await Promise.all(pending.slice(offset,offset+6).map(async entry=>{
    const start=performance.now(),language=languageOf(settings,entry.question),mcq=parseMCQ(entry.question),number=entry.number||entry.id;
    try{
     if(mcq.detected&&!mcq.complete){this.capture!.basket.markError(entry.id,'multiUnclear');this.update();return;}
     const sources=settings.traceSearch?await createSearchProvider().search(entry.question,language,signal):[];
     signal.throwIfAborted();
     const result=await llm.answerTrace(entry.question,mcq,sources,settings,language,signal,partial=>{
      const answer=formatTrace(number-1,mcq,partial,settings,language);this.capture!.basket.setPartial(entry.id,answer);this.update();
     });
     if(result.unclear)this.capture!.basket.markError(entry.id,'multiUnclear');
     else this.capture!.basket.markAnswered(entry.id,formatTrace(number-1,mcq,result,settings,language),sources);
     console.info('winbot:timing',JSON.stringify({stage:'multipage-answer',q:number,ms:Math.round(performance.now()-start)}));
    }catch(error){if(!signal.aborted)this.capture!.basket.markError(entry.id,error instanceof WinbotError?error.code:'apiFailure');}
    this.update();
   }));
  }
 }
 cancel(){this.abort?.abort();this.capture?.done();this.closeBadge();this.answering=false;this.hooks.capturing(false);this.hooks.showPanel();this.update();}
 clear(){this.cancel();this.capture?.basket.clear();this.capture=undefined;this.mode=undefined;this.pages=0;this.reason=undefined;this.update();}
}
