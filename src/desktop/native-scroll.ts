import koffi from 'koffi';
import {WinbotError} from '../core/model';

/** One wheel step while the overlay is hidden, so the app under the pointer scrolls. */
export function scrollUnderlying(direction:'down'|'up'){
 try{
  if(process.platform==='win32'){
   const user=koffi.load('user32.dll');
   // Signed wheel delta is carried in the DWORD's two's-complement bits.
   const wheel=user.func('void __stdcall mouse_event(uint32_t,uint32_t,uint32_t,uint32_t,uintptr_t)');
   wheel(0x0800,0,0,direction==='down'?(-240>>>0):240,0);
   return;
  }
  if(process.platform==='darwin'){
   const cg=koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
   const cf=koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
   const create=cg.func('void * CGEventCreateScrollWheelEvent(void *,uint32_t,uint32_t,int32_t)');
   const event=create(null,0,1,direction==='down'?-3:3);
   if(!event)throw new Error('scroll');
   try{cg.func('void CGEventPost(uint32_t,void *)')(0,event);}
   finally{cf.func('void CFRelease(void *)')(event);}
   return;
  }
  if(process.platform==='linux'&&process.env.XDG_SESSION_TYPE!=='wayland'){
   const x=koffi.load('libX11.so.6'),xt=koffi.load('libXtst.so.6');
   const display=x.func('void * XOpenDisplay(const char *)')(null);
   if(!display)throw new Error('scroll');
   try{
    const event=xt.func('int XTestFakeButtonEvent(void *,unsigned int,int,unsigned long)');
    const button=direction==='down'?5:4;
    if(!event(display,button,1,0)||!event(display,button,0,0))throw new Error('scroll');
    x.func('int XFlush(void *)')(display);
   }finally{x.func('int XCloseDisplay(void *)')(display);}
   return;
  }
 }catch{throw new WinbotError('traceScrollUnsupported');}
 throw new WinbotError('traceScrollUnsupported');
}
