import {BrowserWindow,screen} from 'electron';
import path from 'node:path';
import {z} from 'zod';
import {Region,regionSchema,TraceItem,TracePipeline} from '../core/trace';
import {Settings,WinbotError} from '../core/model';
import {TraceOCR} from '../providers/trace-ocr';
import {TraceLLM} from '../providers/trace-llm';
import {createSearchProvider} from '../providers';
import {captureRegion} from './region-capture';
export class TraceSession {
 overlay?:BrowserWindow;display?:Electron.Display;regions:Region[]=[];
 private ocr=new TraceOCR();
 private pipeline:TracePipeline;
 constructor(private hooks:{assert:()=>void;capturing:(active:boolean)=>void;changed:()=>void}){
  let captures=0;
  this.pipeline=new TracePipeline({ocr:this.ocr,llm:new TraceLLM(),search:{search:(...args)=>createSearchProvider().search(...args)},capture:{capture:async(region,signal)=>{
   this.hooks.assert();signal.throwIfAborted();captures++;this.hooks.capturing(true);
   try{return await captureRegion(region,this.display!,signal);}finally{captures--;this.hooks.capturing(captures>0);}
  }}});
 }
 owns(contents:Electron.WebContents){return this.overlay?.webContents===contents;}
 get selecting(){return !!this.overlay&&!this.overlay.isDestroyed();}
 async open(settings:Settings){
  this.hooks.assert();if(this.selecting){this.overlay!.focus();return;}
  if(!settings.ocr)throw new WinbotError('ocrDisabled');
  if(process.platform==='linux'&&process.env.XDG_SESSION_TYPE==='wayland')throw new WinbotError('traceUnsupported');
  this.display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());this.regions=[];
  this.overlay=new BrowserWindow({...this.display.bounds,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,movable:false,alwaysOnTop:true,skipTaskbar:false,hasShadow:false,show:false,title:'Winbot Trace',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  this.overlay.setAlwaysOnTop(true,'screen-saver');this.overlay.setMenu(null);
  this.overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.overlay.webContents.on('will-navigate',e=>e.preventDefault());
  this.overlay.on('closed',()=>{this.overlay=undefined;this.regions=[];this.hooks.changed();});
  // Warm local OCR workers while the user draws; no screenshot is taken here.
  const overlay=this.overlay;this.ocr.warm();await overlay.loadFile(path.join(__dirname,'../dist/trace.html'));if(this.overlay!==overlay||overlay.isDestroyed())return;overlay.show();overlay.focus();this.hooks.changed();
 }
 select(payload:unknown){
  if(!this.selecting||!this.display)throw new WinbotError('traceRegions');
  const result=z.array(regionSchema).max(8).safeParse(payload);if(!result.success)throw new WinbotError('traceRegions');
  for(const r of result.data)if(r.x+r.width>this.display.bounds.width||r.y+r.height>this.display.bounds.height)throw new WinbotError('traceRegions');
  this.regions=result.data;this.hooks.changed();
 }
 requestSubmit(){this.overlay?.webContents.send('trace-submit-request');}
 async run(settings:Settings,signal:AbortSignal,emit:(item:TraceItem)=>void){
  this.hooks.assert();const regions=[...this.regions];if(!regions.length||!this.display)throw new WinbotError('traceRegions');
  const display=screen.getAllDisplays().find(d=>d.id===this.display!.id);
  if(!display||JSON.stringify(display.bounds)!==JSON.stringify(this.display.bounds)||display.scaleFactor!==this.display.scaleFactor)throw new WinbotError('captureDisplayChanged');
  this.overlay?.hide();this.overlay?.destroy();this.overlay=undefined;this.regions=[];this.hooks.changed();
  await new Promise(r=>setTimeout(r,180));signal.throwIfAborted();
  return this.pipeline.run(regions,settings,signal,emit);
 }
 cancel(){this.overlay?.destroy();this.overlay=undefined;this.regions=[];void this.ocr.close();this.hooks.changed();}
 clear(){this.pipeline.clear();}
}
