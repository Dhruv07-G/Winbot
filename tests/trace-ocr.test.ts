import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({recognize:vi.fn(),setParameters:vi.fn(async()=>{}),reinitialize:vi.fn(async()=>{}),terminate:vi.fn(async()=>{})}));
vi.mock('tesseract.js',()=>({PSM:{AUTO:'3',SPARSE_TEXT:'11'},createWorker:vi.fn(async()=>mocks)}));
import {TraceOCR,cleanOCRChoices} from '../src/providers/trace-ocr';
import {parseMCQ} from '../src/core/trace';
const broken="Which organelle produces most of a cell's ATP?\nA) Nudleus\nB) Ribosome\n(0 Mitochondrion\nD) Golgi apparatus";
const corrected=broken.replace('(0 Mitochondrion','C) Mitochondrion');
beforeEach(()=>{vi.clearAllMocks();mocks.recognize.mockReset();});
it('re-reads ambiguous option labels instead of inventing the missing C',async()=>{
 mocks.recognize.mockResolvedValueOnce({data:{text:broken}}).mockResolvedValueOnce({data:{text:corrected}});
 const ocr=new TraceOCR();ocr.warm(1);
 expect(await ocr.extract(new Uint8Array([1]),new AbortController().signal)).toBe(corrected);
 expect(mocks.recognize).toHaveBeenCalledTimes(2);
 expect(mocks.setParameters).toHaveBeenLastCalledWith({tessedit_pageseg_mode:'11'});
 expect(mocks.reinitialize.mock.calls).toEqual([['eng'],['eng+hin']]);await ocr.close();
});
it('retains unclear text when a second reading still misses a label',async()=>{
 mocks.recognize.mockResolvedValue({data:{text:broken}});const ocr=new TraceOCR();ocr.warm(1);
 const text=await ocr.extract(new Uint8Array([1]),new AbortController().signal);
 expect(text).toBe(broken);expect(parseMCQ(text).complete).toBe(false);await ocr.close();
});
it('does not add a second OCR pass for already complete choices',async()=>{
 mocks.recognize.mockResolvedValue({data:{text:corrected}});const ocr=new TraceOCR();ocr.warm(1);
 expect(await ocr.extract(new Uint8Array([1]),new AbortController().signal)).toBe(corrected);
 expect(mocks.recognize).toHaveBeenCalledTimes(1);expect(mocks.reinitialize).not.toHaveBeenCalled();await ocr.close();
});
it('keeps Hindi OCR enabled when retrying Hindi questions',async()=>{
 mocks.recognize.mockResolvedValueOnce({data:{text:'प्रश्न\nA) एक\nC) तीन\nD) चार'}}).mockResolvedValueOnce({data:{text:'प्रश्न\nA) एक\nB) दो\nC) तीन\nD) चार'}});
 const ocr=new TraceOCR();ocr.warm(1);expect(parseMCQ(await ocr.extract(new Uint8Array([1]),new AbortController().signal)).complete).toBe(true);
 expect(mocks.reinitialize).not.toHaveBeenCalled();await ocr.close();
});
it('aborts before starting the retry if cancelled after the first read',async()=>{
 const controller=new AbortController();mocks.recognize.mockImplementation(async()=>{controller.abort();return {data:{text:broken}};});
 const ocr=new TraceOCR();ocr.warm(1);await expect(ocr.extract(new Uint8Array([1]),controller.signal)).rejects.toThrow();
 expect(mocks.recognize).toHaveBeenCalledTimes(1);expect(mocks.terminate).toHaveBeenCalled();await ocr.close();
});

it('cleans the reproduced CQ) punctuation artifact only with a complete observed A/B/C/D sequence',()=>{
 expect(cleanOCRChoices(corrected.replace('C) Mito','CQ) Mito'))).toBe(corrected);
 expect(cleanOCRChoices(broken)).toBe(broken);
 const missing=corrected.replace('B) Ribosome\n','').replace('C) Mito','CQ) Mito');
 expect(cleanOCRChoices(missing)).toBe(missing);
});
