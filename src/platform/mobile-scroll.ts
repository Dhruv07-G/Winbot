import type {ScrollProvider,FrameReader} from '../core/multi-page';

/** Native mobile hosts implement these bridges; the shared basket never imports OS APIs. */
export interface AndroidBridge {
 mediaProjectionGranted():boolean;
 accessibilityGranted():boolean;
 captureMediaProjection(signal:AbortSignal):Promise<Uint8Array>;
 scrollForward(signal:AbortSignal):Promise<boolean>;
 dispatchSwipe(signal:AbortSignal):Promise<void>;
 recognizeMLKit(image:Uint8Array,signal:AbortSignal):Promise<string>;
 showBubble(progress:string):void;
 hideBubble():void;
}
export class AndroidScrollProvider implements ScrollProvider,FrameReader {
 constructor(private bridge:AndroidBridge){}
 canAutoScroll(){return this.bridge.mediaProjectionGranted()&&this.bridge.accessibilityGranted();}
 async scrollNext(signal:AbortSignal){signal.throwIfAborted();if(!this.canAutoScroll())throw Error('Android capture or Accessibility consent required');if(!await this.bridge.scrollForward(signal))await this.bridge.dispatchSwipe(signal);}
 async capture(signal:AbortSignal){signal.throwIfAborted();if(!this.bridge.mediaProjectionGranted())throw Error('MediaProjection consent required');return this.bridge.captureMediaProjection(signal);}
 extract(image:Uint8Array,signal:AbortSignal){return this.bridge.recognizeMLKit(image,signal);}
 async close(){this.bridge.hideBubble();}
 showProgress(first:number,last:number){this.bridge.showBubble('Q'+first+'–Q'+last+' captured, keep scrolling');}
}
export interface IosBridge {
 replayKitActive():boolean;
 captureReplayKit(signal:AbortSignal):Promise<Uint8Array>;
 recognizeVision(image:Uint8Array,signal:AbortSignal):Promise<string>;
 showProgress(text:string):void;
 hideProgress():void;
}
export class IosScrollProvider implements ScrollProvider,FrameReader {
 constructor(private bridge:IosBridge){}
 canAutoScroll(){return false;}
 async scrollNext(){throw Error('iOS supports scroll-watch only');}
 async capture(signal:AbortSignal){signal.throwIfAborted();if(!this.bridge.replayKitActive())throw Error('ReplayKit consent required');return this.bridge.captureReplayKit(signal);}
 extract(image:Uint8Array,signal:AbortSignal){return this.bridge.recognizeVision(image,signal);}
 async close(){this.bridge.hideProgress();}
 showProgress(first:number,last:number){this.bridge.showProgress('Q'+first+'–Q'+last+' captured, keep scrolling');}
}
