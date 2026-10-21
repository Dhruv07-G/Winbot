import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({
 bytes:Buffer.alloc(54+16*12*4),
 bitmap:vi.fn(),encoded:vi.fn(),terminate:vi.fn(),
}));
vi.mock('node:worker_threads',()=>({Worker:class{
 once(name:string,callback:(value:any)=>void){if(name==='message')queueMicrotask(()=>callback({bytes:mock.bytes}));return this;}
 terminate=mock.terminate;
}}));
vi.mock('electron',()=>{
 const image={isEmpty:()=>false,getSize:()=>({width:16,height:12}),toPNG:()=>Buffer.from('png')};
 return {screen:{dipToScreenRect:(_:unknown,rect:unknown)=>rect},nativeImage:{
 createFromBitmap:(bytes:Buffer,size:unknown)=>{mock.bitmap(Buffer.from(bytes),size);return image;},
 createFromBuffer:(bytes:Buffer)=>{mock.encoded(Buffer.from(bytes));return image;},
 }};
});
import {captureRegion} from '../src/desktop/region-capture';
it('passes top-down BGRA to the bitmap API and erases worker bytes',async()=>{
 mock.bytes.fill(0);mock.bytes.write('BM');mock.bytes.writeInt32LE(16,18);mock.bytes.writeInt32LE(-12,22);
 mock.bytes.fill(255,54);
 const display={bounds:{x:0,y:0,width:100,height:100}} as Electron.Display;
 const result=await captureRegion({x:0,y:0,width:16,height:12},display,new AbortController().signal);
 expect(mock.bitmap).toHaveBeenCalledWith(Buffer.alloc(16*12*4,255),{width:16,height:12,scaleFactor:1});
 expect(mock.encoded).not.toHaveBeenCalled();expect(mock.bytes.every(v=>v===0)).toBe(true);
 expect(result.toString()).toBe('png');expect(mock.terminate).toHaveBeenCalled();
});
it('rejects out-of-bounds selections without invoking a worker',async()=>{
 await expect(captureRegion({x:90,y:0,width:16,height:12},{bounds:{width:100,height:100}} as Electron.Display,new AbortController().signal)).rejects.toThrow();
});
