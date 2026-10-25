import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({wheel:vi.fn(),get:vi.fn(),set:vi.fn(),load:vi.fn()}));
vi.mock('koffi',()=>({default:{load:mocks.load}}));
import {scrollUnderlying} from '../src/desktop/native-scroll';
beforeEach(()=>{
 mocks.wheel.mockReset();
 mocks.get.mockReset().mockImplementation((point:Int32Array)=>{point[0]=321;point[1]=222;return 1;});
 mocks.set.mockReset().mockReturnValue(1);
 mocks.load.mockReset().mockReturnValue({func:(signature:string)=>signature.includes('GetCursorPos')?mocks.get:signature.includes('SetCursorPos')?mocks.set:mocks.wheel});
});
it.skipIf(process.platform!=='win32')('wheels inside the document and restores the original cursor',()=>{
 scrollUnderlying('down',{x:500,y:440});
 expect(mocks.load).toHaveBeenCalledWith('user32.dll');
 expect(mocks.get).toHaveBeenCalledTimes(1);
 expect(mocks.set.mock.calls).toEqual([[500,440],[321,222]]);
 expect(mocks.wheel).toHaveBeenCalledWith(0x0800,0,0,(-240>>>0),0);
});
it.skipIf(process.platform!=='win32')('restores the cursor if wheel injection fails',()=>{
 mocks.wheel.mockImplementationOnce(()=>{throw new Error('native failure');});
 expect(()=>scrollUnderlying('down',{x:500,y:440})).toThrow();
 expect(mocks.set.mock.calls).toEqual([[500,440],[321,222]]);
});
it.skipIf(process.platform!=='win32')('sends a wheel-up step with positive delta',()=>{
 scrollUnderlying('up',{x:500,y:440});
 expect(mocks.wheel).toHaveBeenCalledWith(0x0800,0,0,240,0);
});
