import {expect,it,vi} from 'vitest';
import {AndroidScrollProvider,IosScrollProvider} from '../src/platform/mobile-scroll';
it('requires Android screen and accessibility consent before automatic scrolling',async()=>{
 let screen=false,access=false;
 const bridge={mediaProjectionGranted:()=>screen,accessibilityGranted:()=>access,captureMediaProjection:vi.fn(async()=>new Uint8Array([1])),scrollForward:vi.fn(async()=>false),dispatchSwipe:vi.fn(async()=>{}),recognizeMLKit:vi.fn(async()=>''),showBubble:vi.fn(),hideBubble:vi.fn()};
 const adapter=new AndroidScrollProvider(bridge);
 expect(adapter.canAutoScroll()).toBe(false);
 await expect(adapter.capture(new AbortController().signal)).rejects.toThrow('MediaProjection');
 screen=true;expect(adapter.canAutoScroll()).toBe(false);access=true;
 await adapter.scrollNext(new AbortController().signal);
 expect(bridge.scrollForward).toHaveBeenCalledOnce();expect(bridge.dispatchSwipe).toHaveBeenCalledOnce();
});
it('keeps iOS in scroll-watch and requires ReplayKit',async()=>{
 let active=false;
 const bridge={replayKitActive:()=>active,captureReplayKit:vi.fn(async()=>new Uint8Array([2])),recognizeVision:vi.fn(async()=>''),showProgress:vi.fn(),hideProgress:vi.fn()};
 const adapter=new IosScrollProvider(bridge);
 expect(adapter.canAutoScroll()).toBe(false);
 await expect(adapter.capture(new AbortController().signal)).rejects.toThrow('ReplayKit');
 active=true;expect(await adapter.capture(new AbortController().signal)).toEqual(new Uint8Array([2]));
 await expect(adapter.scrollNext()).rejects.toThrow('scroll-watch');
});

