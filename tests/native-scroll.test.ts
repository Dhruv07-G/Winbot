import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({wheel:vi.fn(),load:vi.fn()}));
vi.mock('koffi',()=>({default:{load:mocks.load}}));
import {scrollUnderlying} from '../src/desktop/native-scroll';
beforeEach(()=>{mocks.wheel.mockReset();mocks.load.mockReset().mockReturnValue({func:()=>mocks.wheel});});
it.skipIf(process.platform!=='win32')('moves above bottom controls, wheels down, then restores the cursor',()=>{
 scrollUnderlying('down');
 expect(mocks.load).toHaveBeenCalledWith('user32.dll');
 expect(mocks.wheel.mock.calls).toEqual([
  [0x0001,0,(-120>>>0),0,0],
  [0x0800,0,0,(-240>>>0),0],
  [0x0001,0,120,0,0],
 ]);
});
it.skipIf(process.platform!=='win32')('sends a wheel-up step with positive delta',()=>{
 scrollUnderlying('up');
 expect(mocks.wheel.mock.calls[1]).toEqual([0x0800,0,0,240,0]);
});
