import {beforeEach,expect,it,vi} from 'vitest';
import {defaults} from '../src/core/model';
const mocks=vi.hoisted(()=>({
 windows:[] as any[],warm:vi.fn(),close:vi.fn(async()=>{}),
 capture:vi.fn(async()=>new Uint8Array([1])),
 display:{id:1,bounds:{x:0,y:0,width:1000,height:800},scaleFactor:1},
}));
vi.mock('electron',()=>({
 screen:{getCursorScreenPoint:()=>({x:10,y:10}),getDisplayNearestPoint:()=>mocks.display,getAllDisplays:()=>[mocks.display]},
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
import {TraceSession} from '../src/desktop/trace-session';
beforeEach(()=>{vi.clearAllMocks();mocks.windows=[];});
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
 expect(()=>session.select(Array(9).fill(region))).toThrow();
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
