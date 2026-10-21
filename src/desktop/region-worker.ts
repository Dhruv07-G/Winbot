import { parentPort, workerData } from 'node:worker_threads';
import koffi from 'koffi';
let stage='captureNativeLoad';
type Rect={x:number;y:number;width:number;height:number};
function bmp(bytes:Buffer,width:number,height:number){
 const header=Buffer.alloc(54);header.write('BM');header.writeUInt32LE(54+bytes.length,2);header.writeUInt32LE(54,10);header.writeUInt32LE(40,14);header.writeInt32LE(width,18);header.writeInt32LE(-height,22);header.writeUInt16LE(1,26);header.writeUInt16LE(32,28);header.writeUInt32LE(bytes.length,34);
 const result=Buffer.concat([header,bytes]);bytes.fill(0);return result;
}
function windows(r:Rect){
 const user=koffi.load('user32.dll'),gdi=koffi.load('gdi32.dll');
 const GetDC=user.func('void * __stdcall GetDC(void *)'),ReleaseDC=user.func('int __stdcall ReleaseDC(void *, void *)');
 const CreateDC=gdi.func('void * __stdcall CreateCompatibleDC(void *)'),DeleteDC=gdi.func('int __stdcall DeleteDC(void *)');
 const CreateBitmap=gdi.func('void * __stdcall CreateCompatibleBitmap(void *, int, int)'),DeleteObject=gdi.func('int __stdcall DeleteObject(void *)'),Select=gdi.func('void * __stdcall SelectObject(void *,void *)');
 const BitBlt=gdi.func('int __stdcall BitBlt(void *,int,int,int,int,void *,int,int,uint32_t)');
 const GetBits=gdi.func('int __stdcall GetDIBits(void *,void *,uint32_t,uint32_t,_Out_ void *,void *,uint32_t)');
 stage='captureNativeDC';const dc=GetDC(null);if(!dc)throw Error('capture');let mem:any=null,bitmap:any=null,old:any=null;
 try{
  stage='captureNativeBitmap';mem=CreateDC(dc);bitmap=CreateBitmap(dc,r.width,r.height);if(!mem||!bitmap)throw Error('capture');old=Select(mem,bitmap);
  // Only this rectangle is copied: no full-screen bitmap is allocated.
  stage='captureNativeBlit';if(!BitBlt(mem,0,0,r.width,r.height,dc,r.x,r.y,0x00CC0020|0x40000000))throw Error('capture');
  Select(mem,old);old=null;
  const info=Buffer.alloc(40);info.writeUInt32LE(40,0);info.writeInt32LE(r.width,4);info.writeInt32LE(-r.height,8);info.writeUInt16LE(1,12);info.writeUInt16LE(32,14);
  const pixels=Buffer.alloc(r.width*r.height*4);
  stage='captureNativeRead';if(GetBits(dc,bitmap,0,r.height,pixels,info,0)!==r.height){pixels.fill(0);throw Error('capture');}
  for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  return bmp(pixels,r.width,r.height);
 }finally{if(old&&mem)Select(mem,old);if(bitmap)DeleteObject(bitmap);if(mem)DeleteDC(mem);ReleaseDC(null,dc);}
}
function mac(r:Rect){
 const cg=koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics'),cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'),io=koffi.load('/System/Library/Frameworks/ImageIO.framework/ImageIO');
 const Point=koffi.struct('TracePoint',{x:'double',y:'double'}),Size=koffi.struct('TraceSize',{width:'double',height:'double'}),Rect=koffi.struct('TraceRect',{origin:Point,size:Size});
 const capture=cg.func('CGWindowListCreateImage','void *',[Rect,'uint32_t','uint32_t','uint32_t']);
 const image=capture({origin:{x:r.x,y:r.y},size:{width:r.width,height:r.height}},1,0,0);if(!image)throw Error('capture');
 const release=cf.func('void CFRelease(void *)');let data:any=null,type:any=null,destination:any=null;
 try{
  data=cf.func('void * CFDataCreateMutable(void *,long)')(null,0);type=cf.func('void * CFStringCreateWithCString(void *,const char *,uint32_t)')(null,'public.png',0x08000100);
  destination=io.func('void * CGImageDestinationCreateWithData(void *,void *,size_t,void *)')(data,type,1,null);if(!destination)throw Error('capture');
  io.func('void CGImageDestinationAddImage(void *,void *,void *)')(destination,image,null);
  if(!io.func('bool CGImageDestinationFinalize(void *)')(destination))throw Error('capture');
  const length=Number(cf.func('long CFDataGetLength(void *)')(data));const ptr=cf.func('void * CFDataGetBytePtr(void *)')(data);
  return Buffer.from(koffi.decode(ptr,'uint8_t',length));
 }finally{if(destination)release(destination);if(type)release(type);if(data)release(data);cg.func('void CGImageRelease(void *)')(image);}
}
function linux(r:Rect){
 // X11 uses XGetImage with the selected rectangle. Wayland needs a region-capable portal adapter.
 if(process.env.XDG_SESSION_TYPE==='wayland')throw Error('traceUnsupported');
 const x=koffi.load('libX11.so.6');const display=x.func('void * XOpenDisplay(const char *)')(null);if(!display)throw Error('capture');
 const Image=koffi.struct('TraceXImage',{width:'int',height:'int',xoffset:'int',format:'int',data:'void *',byte_order:'int',bitmap_unit:'int',bitmap_bit_order:'int',bitmap_pad:'int',depth:'int',bytes_per_line:'int',bits_per_pixel:'int',red_mask:'unsigned long',green_mask:'unsigned long',blue_mask:'unsigned long'});
 let image:any=null;
 try{
  const root=x.func('unsigned long XDefaultRootWindow(void *)')(display);
  image=x.func('void * XGetImage(void *,unsigned long,int,int,unsigned int,unsigned int,unsigned long,int)')(display,root,r.x,r.y,r.width,r.height,0xffffffff,2);if(!image)throw Error('capture');
  const info:any=koffi.decode(image,Image);
  if(info.bits_per_pixel!==32||info.byte_order!==0||Number(info.red_mask)!==0xff0000||Number(info.blue_mask)!==0xff)throw Error('traceUnsupported');
  const raw=Buffer.from(koffi.decode(info.data,'uint8_t',info.bytes_per_line*r.height));const pixels=Buffer.alloc(r.width*r.height*4);
  for(let y=0;y<r.height;y++)raw.copy(pixels,y*r.width*4,y*info.bytes_per_line,y*info.bytes_per_line+r.width*4);raw.fill(0);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  return bmp(pixels,r.width,r.height);
 }finally{if(image)x.func('int XDestroyImage(void *)')(image);x.func('int XCloseDisplay(void *)')(display);}
}
try{
 stage='traceRegions';const r:Rect=workerData;
 if(![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.width<1||r.height<1||r.width*r.height>24000000)throw Error('capture');
 stage='captureNativeLoad';const image=process.platform==='win32'?windows(r):process.platform==='darwin'?mac(r):process.platform==='linux'?linux(r):(()=>{throw Error('traceUnsupported');})();
 stage='captureTransfer';const bytes=new Uint8Array(image);image.fill(0);parentPort!.postMessage({bytes},[bytes.buffer]);
}catch(e){parentPort!.postMessage({error:e instanceof Error&&e.message==='traceUnsupported'?'traceUnsupported':stage});}
