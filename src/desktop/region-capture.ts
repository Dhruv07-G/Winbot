import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { nativeImage, screen } from 'electron';
import type { Region } from '../core/trace';
import { WinbotError } from '../core/model';
/** Native region-only capture; never calls desktopCapturer. */
export async function captureRegion(region:Region,display:Electron.Display,signal:AbortSignal,options?:{maxDimension?:number}):Promise<Uint8Array>{
 signal.throwIfAborted();
 if(region.x<0||region.y<0||region.x+region.width>display.bounds.width||region.y+region.height>display.bounds.height)throw new WinbotError('traceRegions');
 const dip={x:Math.floor(display.bounds.x+region.x),y:Math.floor(display.bounds.y+region.y),width:Math.ceil(region.width),height:Math.ceil(region.height)};
 let rect;try{rect=process.platform==='win32'?screen.dipToScreenRect(null,dip):dip;}catch{throw new WinbotError('captureCoordinates');}
 return new Promise((resolve,reject)=>{
  let worker:Worker;try{worker=new Worker(path.join(__dirname,'region-worker.cjs'),{workerData:rect});}catch{reject(new WinbotError('captureWorkerStart'));return;}let done=false;
  const finish=(error?:unknown,bytes?:Uint8Array)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker.terminate();if(error)reject(error);else resolve(bytes!);};
  const abort=()=>finish(signal.reason||new Error('cancelled'));const timer=setTimeout(()=>finish(new WinbotError('captureTimeout')),15000);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  worker.once('error',()=>finish(new WinbotError('captureWorkerLoad')));worker.once('exit',()=>{if(!done)finish(new WinbotError('captureWorkerExit'));});
  worker.once('message',({bytes,error}:{bytes?:Uint8Array;error?:string})=>{
   if(error){finish(new WinbotError(error));return;}
   if(!bytes){finish(new WinbotError('captureTransfer'));return;}
   try{
    signal.throwIfAborted();
    // GDI/X11 return a top-down BGRA bitmap; Electron's encoded-image API
    // only guarantees PNG/JPEG decoding. Pass bitmap pixels explicitly.
    const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let image;
    if(buffer.length>=54&&buffer.toString('ascii',0,2)==='BM'){
     const width=buffer.readInt32LE(18),height=-buffer.readInt32LE(22);
     if(width<1||height<1||buffer.length!==54+width*height*4)throw new WinbotError('captureDecode');
     image=nativeImage.createFromBitmap(buffer.subarray(54),{width,height,scaleFactor:1});
    }else image=nativeImage.createFromBuffer(buffer);
    bytes.fill(0);
    if(image.isEmpty())throw new WinbotError('captureDecode');
    const size=image.getSize();const longest=Math.max(size.width,size.height);
    // Small UI lettering benefits from larger glyphs before local OCR.
    const factor=options?.maxDimension?Math.min(2,options.maxDimension/longest):longest>1800?1800/longest:longest<1200?Math.min(2,1800/longest):1;
    if(factor!==1)image=image.resize({width:Math.round(size.width*factor),height:Math.round(size.height*factor),quality:'best'});
    finish(undefined,image.toPNG());
   }catch(e){bytes.fill(0);finish(signal.aborted?e:new WinbotError('captureDecode'));}
  });
 });
}
