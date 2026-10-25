import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({wheel:vi.fn(),load:vi.fn()}));
vi.mock('koffi',()=>({default:{load:mocks.load}}));
import {scrollUnderlying} from '../src/desktop/native-scroll';
beforeEach(()=>{mocks.wheel.mockReset();mocks.load.mockReset().mockReturnValue({func:()=>mocks.wheel});});
it.skipIf(process.platform!=='win32')('sends a wheel-down step to the app under the cursor',()=>{
 scrollUnderlying('down');
 expect(mocks.load).toHaveBeenCalledWith('user32.dll');
 expect(mocks.wheel).toHaveBeenCalledWith(0x0800,0,0,(-240>>>0),0);
});
it.skipIf(process.platform!=='win32')('sends a wheel-up step with positive delta',()=>{
 scrollUnderlying('up');
 expect(mocks.wheel).toHaveBeenCalledWith(0x0800,0,0,240,0);
});
