import {beforeEach,expect,it,vi} from 'vitest';
import {defaults} from '../src/core/model';
const mocks=vi.hoisted(()=>({
 windows:[] as any[],warm:vi.fn(),close:vi.fn(async()=>{}),
 capture:vi.fn(async()=>new Uint8Array([1])),scroll:vi.fn(),
 display:{id:1,bounds:{x:0,y:0,width:1000,height:800},scaleFactor:1},cursor:{x:10,y:10},
}));
vi.mock('electron',()=>({
 screen:{getCursorScreenPoint:()=>mocks.cursor,getDisplayNearestPoint:()=>mocks.display,getAllDisplays:()=>[mocks.display]},
 BrowserWindow:class{
  destroyed=false;callbacks=new Map();
  webContents={send:vi.fn(),on:vi.fn(),setWindowOpenHandler:vi.fn()};
  constructor(){mocks.windows.push(this);}
  setAlwaysOnTop=vi.fn();setMenu=vi.fn();show=vi.fn();hide=vi.fn();focus=vi.fn();
  loadFile=vi.fn(async()=>{});on=(event:string,callback:()=>void)=>this.callbacks.set(event,callback);
  isDestroyed=()=>this.destroyed;
  destroy(){this.destroyed=true;this.callbacks.get('closed')?.();}
 },
}));
vi.mock('../src/providers/trace-ocr',()=>({TraceOCR:class{warm=mocks.warm;close=mocks.close;extract=async()=> 'What is two plus two?';}}));
vi.mock('../src/providers/trace-llm',()=>({TraceLLM:class{identity=()=> 'test';answerTrace=async()=>({unclear:false,answer:'4'});}}));
vi.mock('../src/providers',()=>({createSearchProvider:()=>({search:async()=>[]})}));
vi.mock('../src/desktop/region-capture',()=>({captureRegion:mocks.capture}));
vi.mock('../src/desktop/native-scroll',()=>({scrollUnderlying:mocks.scroll}));
import {TraceSession} from '../src/desktop/trace-session';
beforeEach(()=>{vi.clearAllMocks();mocks.capture.mockReset().mockImplementation(async()=>new Uint8Array([1]));mocks.scroll.mockReset();mocks.cursor={x:10,y:10};mocks.windows=[];});
const region={x:20,y:30,width:200,height:100};
it('opens without capturing, edits selections, submits by hotkey event and cancels cleanly',async()=>{
 const assert=vi.fn(),session=new TraceSession({assert,capturing:vi.fn(),changed:vi.fn()});
 await session.open(defaults);const overlay=mocks.windows[0];
 expect(assert).toHaveBeenCalled();expect(mocks.capture).not.toHaveBeenCalled();
 expect(session.owns(overlay.webContents)).toBe(true);
 session.select([region,{...region,y:200}]);session.select([{...region,x:40}]);
 expect(session.regions).toEqual([{...region,x:40}]);
 session.requestSubmit();expect(overlay.webContents.send).toHaveBeenCalledWith('trace-submit-request');
 session.cancel();expect(session.selecting).toBe(false);expect(session.regions).toEqual([]);
 expect(mocks.close).toHaveBeenCalled();expect(mocks.capture).not.toHaveBeenCalled();
});
it('rejects invalid or off-screen regions before capture',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:()=>{},changed:()=>{}});
 await session.open(defaults);
 expect(()=>session.select([{...region,width:2000}])).toThrow();
 expect(()=>session.select([{...region,x:-1}])).toThrow();
 expect(()=>session.select(Array(17).fill(region))).toThrow();
 expect(mocks.capture).not.toHaveBeenCalled();session.cancel();
});
it('destroys overlay before capturing and preserves numbered batch results',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:vi.fn(),changed:()=>{}});
 await session.open(defaults);session.select([region,{...region,y:200}]);
 mocks.capture.mockImplementation(async()=>{expect(mocks.windows[0].destroyed).toBe(true);return new Uint8Array([1]);});
 const items=await session.run(defaults,new AbortController().signal,()=>{});
 expect(items.map(i=>i.index)).toEqual([0,1]);expect(mocks.capture).toHaveBeenCalledTimes(2);
 expect(session.selecting).toBe(false);
});
it('cancellation during overlay dismissal prevents every region capture',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:()=>{},changed:()=>{}});
 await session.open(defaults);session.select([region]);const controller=new AbortController();
 const job=session.run(defaults,controller.signal,()=>{});controller.abort();session.cancel();
 await expect(job).rejects.toThrow();expect(mocks.capture).not.toHaveBeenCalled();
});

it('saves each viewport before scrolling and answers both without recapturing the first',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:vi.fn(),changed:()=>{}});
 await session.open(defaults);session.select([region]);
 const first=new Uint8Array([9]),order:string[]=[];
 mocks.capture.mockImplementationOnce(async()=>{order.push('capture');return first;}).mockResolvedValueOnce(new Uint8Array([8]));
 mocks.scroll.mockImplementationOnce(()=>order.push('scroll'));
 await session.scroll('down');
 expect(session.savedCount).toBe(1);expect(session.regions).toEqual([]);
 expect(mocks.scroll).toHaveBeenCalledWith('down');expect(order).toEqual(['capture','scroll']);
 session.select([{...region,y:210}]);
 const items=await session.run(defaults,new AbortController().signal,()=>{});
 expect(items).toHaveLength(2);
 expect(mocks.capture).toHaveBeenCalledTimes(2);
 expect(first[0]).toBe(0);
});
it('does not auto-scroll after the cursor leaves the lower edge',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:()=>{},changed:()=>{}});
 await session.open(defaults);session.select([region]);
 await expect(session.scroll('down',true)).rejects.toThrow();
 expect(mocks.capture).not.toHaveBeenCalled();expect(session.regions).toHaveLength(1);
 mocks.cursor={x:10,y:780};
 await session.scroll('down',true);
 expect(mocks.scroll).toHaveBeenCalledTimes(1);
 session.cancel();
});
it('erases stored screenshots when the user cancels',async()=>{
 const session=new TraceSession({assert:()=>{},capturing:()=>{},changed:()=>{}});
 await session.open(defaults);session.select([region]);
 const image=new Uint8Array([17]);mocks.capture.mockResolvedValueOnce(image);
 await session.scroll('down');
 expect(image[0]).toBe(17);
 session.cancel();
 expect(image[0]).toBe(0);expect(session.selectedCount).toBe(0);
});
