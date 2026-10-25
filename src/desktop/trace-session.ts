import {BrowserWindow,screen} from 'electron';
import path from 'node:path';
import {z} from 'zod';
import {Region,regionSchema,TraceItem,TracePipeline} from '../core/trace';
import {Settings,WinbotError} from '../core/model';
import {TraceOCR} from '../providers/trace-ocr';
import {TraceLLM} from '../providers/trace-llm';
import {createSearchProvider} from '../providers';
import {captureRegion} from './region-capture';
import {scrollUnderlying} from './native-scroll';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export class TraceSession {
 overlay?:BrowserWindow;display?:Electron.Display;regions:Region[]=[];
 private saved:{region:Region;image:Uint8Array}[]=[];
 private scrollJob?:Promise<number>;
 private scrollAbort?:AbortController;
 private captures=0;
 private ocr=new TraceOCR();
 private pipeline:TracePipeline;
 constructor(private hooks:{assert:()=>void;capturing:(active:boolean)=>void;changed:()=>void}){
  this.pipeline=new TracePipeline({ocr:this.ocr,llm:new TraceLLM(),search:{search:(...args)=>createSearchProvider().search(...args)},capture:{capture:(region,signal)=>this.capture(region,signal)}});
 }
 private async capture(region:Region,signal:AbortSignal){
  this.hooks.assert();signal.throwIfAborted();this.captures++;this.hooks.capturing(true);
  try{return await captureRegion(region,this.display!,signal);}
  finally{this.captures--;this.hooks.capturing(this.captures>0);}
 }
 private eraseSaved(){for(const item of this.saved)item.image.fill(0);this.saved=[];}
 owns(contents:Electron.WebContents){return this.overlay?.webContents===contents;}
 get selecting(){return !!this.overlay&&!this.overlay.isDestroyed();}
 get selectedCount(){return this.saved.length+this.regions.length;}
 get savedCount(){return this.saved.length;}
 async open(settings:Settings){
  this.hooks.assert();if(this.selecting){this.overlay!.focus();return;}
  if(!settings.ocr)throw new WinbotError('ocrDisabled');
  if(process.platform==='linux'&&process.env.XDG_SESSION_TYPE==='wayland')throw new WinbotError('traceUnsupported');
  this.display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());this.regions=[];this.eraseSaved();
  this.overlay=new BrowserWindow({...this.display.bounds,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,movable:false,alwaysOnTop:true,skipTaskbar:false,hasShadow:false,show:false,title:'Winbot Trace',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  this.overlay.setAlwaysOnTop(true,'screen-saver');this.overlay.setMenu(null);
  this.overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.overlay.webContents.on('will-navigate',e=>e.preventDefault());
  this.overlay.on('closed',()=>{this.overlay=undefined;this.regions=[];this.eraseSaved();this.hooks.changed();});
  // Warm local OCR workers while the user draws; no screenshot is taken here.
  const overlay=this.overlay;this.ocr.warm();await overlay.loadFile(path.join(__dirname,'../dist/trace.html'));if(this.overlay!==overlay||overlay.isDestroyed())return;overlay.show();overlay.focus();this.hooks.changed();
 }
 select(payload:unknown){
  if(!this.selecting||!this.display||this.scrollJob)throw new WinbotError('traceRegions');
  const result=z.array(regionSchema).max(16-this.saved.length).safeParse(payload);if(!result.success)throw new WinbotError('traceRegions');
  for(const r of result.data)if(r.x+r.width>this.display.bounds.width||r.y+r.height>this.display.bounds.height)throw new WinbotError('traceRegions');
  this.regions=result.data;this.hooks.changed();
 }
 async scroll(direction:'down'|'up',auto=false){
  if(!this.selecting||!this.display)throw new WinbotError('traceRegions');
  const display=screen.getAllDisplays().find(d=>d.id===this.display!.id);
  if(!display||JSON.stringify(display.bounds)!==JSON.stringify(this.display.bounds)||display.scaleFactor!==this.display.scaleFactor)throw new WinbotError('captureDisplayChanged');
  if(auto){
   const cursor=screen.getCursorScreenPoint(),bounds=this.display.bounds;
   // The renderer owns the hover zone. Native cursor coordinates can differ
   // from the overlay viewport at Windows display scaling and taskbar edges.
   if(cursor.x<bounds.x||cursor.x>=bounds.x+bounds.width||cursor.y<bounds.y||cursor.y>=bounds.y+bounds.height)throw new WinbotError('traceScrollPointerMoved');
  }
  if(this.scrollJob)return this.scrollJob;
  const overlay=this.overlay!,live=[...this.regions],abort=new AbortController();
  this.scrollAbort=abort;
  this.scrollJob=(async()=>{
   const staged:{region:Region;image:Uint8Array}[]=[];
   overlay.hide();
   try{
    if(live.length)await delay(180);
    abort.signal.throwIfAborted();
    // Capture only selected rectangles before the page moves. Pixels stay in
    // memory until Answer and are erased on cancellation or completion.
    for(const region of live){
     const image=await this.capture(region,abort.signal);
     staged.push({region,image});
    }
    abort.signal.throwIfAborted();
    const bounds=this.display!.bounds;
    const target=process.platform==='win32'?screen.dipToScreenPoint({x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height*0.55)}):undefined;
    scrollUnderlying(direction,target);
    abort.signal.throwIfAborted();
    if(this.overlay!==overlay||overlay.isDestroyed())throw new WinbotError('traceRegions');
    this.saved.push(...staged);this.regions=[];
    await delay(120);
    this.hooks.changed();
    return this.saved.length;
   }catch(error){
    for(const item of staged)item.image.fill(0);
    throw error;
   }finally{
    if(this.overlay===overlay&&!overlay.isDestroyed()){overlay.show();overlay.focus();}
    this.scrollAbort=undefined;
   }
  })().finally(()=>{this.scrollJob=undefined;});
  return this.scrollJob;
 }
 removeLastSaved(){if(!this.selecting||this.scrollJob)throw new WinbotError('traceRegions');this.saved.pop()?.image.fill(0);this.hooks.changed();}
 clearSelections(){if(!this.selecting||this.scrollJob)throw new WinbotError('traceRegions');this.regions=[];this.eraseSaved();this.hooks.changed();}
 requestSubmit(){this.overlay?.webContents.send('trace-submit-request');}
 async run(settings:Settings,signal:AbortSignal,emit:(item:TraceItem)=>void){
  this.hooks.assert();if(this.scrollJob)await this.scrollJob;
  const saved=this.saved;this.saved=[];
  const regions=[...saved.map(item=>item.region),...this.regions];
  const images=[...saved.map(item=>item.image)];
  if(!regions.length||!this.display)throw new WinbotError('traceRegions');
  const display=screen.getAllDisplays().find(d=>d.id===this.display!.id);
  if(!display||JSON.stringify(display.bounds)!==JSON.stringify(this.display.bounds)||display.scaleFactor!==this.display.scaleFactor){images.forEach(image=>image.fill(0));throw new WinbotError('captureDisplayChanged');}
  this.overlay?.hide();this.overlay?.destroy();this.overlay=undefined;this.regions=[];this.hooks.changed();
  try{await delay(180);signal.throwIfAborted();return await this.pipeline.run(regions,settings,signal,emit,images);}
  finally{images.forEach(image=>image.fill(0));}
 }
 cancel(){this.scrollAbort?.abort();this.overlay?.destroy();this.overlay=undefined;this.regions=[];this.eraseSaved();void this.ocr.close();this.hooks.changed();}
 clear(){this.pipeline.clear();}
}
