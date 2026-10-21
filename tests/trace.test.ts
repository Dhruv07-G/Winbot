import {afterEach,describe,expect,it,vi} from 'vitest';
import {defaults,settingsSchema,WinbotError} from '../src/core/model';
import {parseMCQ,formatTrace,TracePipeline,TraceItem} from '../src/core/trace';
import {TraceLLM} from '../src/providers/trace-llm';
const question='Which ocean is largest?\nA. Atlantic\nB. Indian\nC. Pacific\nD. Arctic';
const settings={...defaults,traceSearch:false};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([
 question,
 'Which?\na) One\nb) Two\nc) Three\nd) Four',
 'कौन?\n1. एक\n2. दो\n3. तीन\n4. चार',
 'Choose\n(i) One\n(ii) Two\n(iii) Three\n(iv) Four',
 'Which? A. One B. Two C. Three D. Four',
])('detects and preserves MCQ labels: %s',text=>{expect(parseMCQ(text).complete).toBe(true);expect(parseMCQ(text).choices).toHaveLength(4);});
it.each(['Question?\nA. One\nC. Three\nD. Four','Question?\nA. Atlantic\nB. Pacific','Question?\nA. One\nB. Two\nC. Three\nD. '])('rejects incomplete or shifted choices',text=>{expect(parseMCQ(text).detected).toBe(true);expect(parseMCQ(text).complete).toBe(false);});
it('does not invent labels; uses the exact source option text',()=>{
 expect(formatTrace(1,parseMCQ(question),{label:'C',answer:'B) wrong'},settings,'en')).toBe('Q2: C) Pacific');
 expect(formatTrace(0,parseMCQ(question),{label:'Z'},settings,'en')).toBe('Q1: Unclear – re-trace');
 expect(formatTrace(0,parseMCQ(question),{unclear:true,label:'C'},settings,'hi')).toBe('Q1: अस्पष्ट – फिर से चुनें');
 expect(formatTrace(0,parseMCQ(question),{label:'C',reason:'Largest area.'},{...settings,traceMCQStyle:'reason'},'en')).toBe('Q1: C) Pacific\nLargest area.');
});
it('formats direct answers without MCQ labels',()=>{expect(formatTrace(2,parseMCQ('What is photosynthesis?'),{answer:'Plants use sunlight.'},settings,'en')).toBe('Q3: Plants use sunlight.');});
it('migrates old settings and validates overlay preferences',()=>{
 const saved=settingsSchema.parse({language:'hi'});expect(saved.traceColor).toBe('#2388ff');expect(saved.traceMCQStyle).toBe('answer');expect(saved.traceSearch).toBe(false);
 expect(settingsSchema.safeParse({...defaults,traceThickness:100}).success).toBe(false);
});
function fixture(){
 const buffers:Uint8Array[]=[];let n=0;
 const providers={capture:{capture:vi.fn(async()=>{const b=new Uint8Array([++n]);buffers.push(b);return b;})},ocr:{extract:vi.fn(async()=>question),close:vi.fn(async()=>{})},search:{search:vi.fn(async()=>[])},llm:{identity:()=> 'test-model',answerTrace:vi.fn(async()=>({unclear:false,label:'C',answer:'',reason:''}))}};
 return {providers,buffers,pipeline:new TracePipeline(providers)};
}
const regions=[{x:0,y:0,width:100,height:100},{x:100,y:0,width:100,height:100}];
it('starts regions concurrently, publishes out of order but keeps Q numbers',async()=>{
 const {providers,pipeline,buffers}=fixture();let release!:()=>void;
 const first=new Promise<void>(r=>release=r);let calls=0;
 providers.ocr.extract.mockImplementation(async()=>{const number=calls++;if(number===0)await first;return question.replace('Which ocean',number?'What ocean':'Which ocean');});
 const events:TraceItem[]=[];const run=pipeline.run(regions,settings,new AbortController().signal,i=>events.push({...i}));
 await vi.waitFor(()=>expect(events.some(i=>i.index===1&&i.status==='done')).toBe(true));
 expect(providers.capture.capture).toHaveBeenCalledTimes(2);release();const result=await run;
 expect(result.map(i=>i.index)).toEqual([0,1]);expect(result[1].text).toBe('Q2: C) Pacific');expect(buffers.every(b=>b.every(v=>v===0))).toBe(true);expect(providers.ocr.close).toHaveBeenCalled();
});
it('deduplicates identical questions, caches text-only results, and clears cache',async()=>{
 const {pipeline,providers}=fixture();await pipeline.run(regions,settings,new AbortController().signal,()=>{});expect(providers.llm.answerTrace).toHaveBeenCalledTimes(1);
 const next=await pipeline.run([regions[0]],settings,new AbortController().signal,()=>{});expect(next[0].cached).toBe(true);pipeline.clear();await pipeline.run([regions[0]],settings,new AbortController().signal,()=>{});expect(providers.llm.answerTrace).toHaveBeenCalledTimes(2);
});
it('handles empty OCR and individual failures without failing the whole batch',async()=>{
 const {pipeline,providers,buffers}=fixture();providers.ocr.extract.mockResolvedValueOnce('').mockRejectedValueOnce(new WinbotError('ocrFailure'));
 const result=await pipeline.run(regions,settings,new AbortController().signal,()=>{});expect(result[0].text).toContain('Unclear');expect(result[1].error).toBe('ocrFailure');expect(providers.llm.answerTrace).not.toHaveBeenCalled();expect(buffers.every(b=>b[0]===0)).toBe(true);
});
it('cancellation prevents late answers and erases image buffers',async()=>{
 const {pipeline,providers,buffers}=fixture();const abort=new AbortController();providers.ocr.extract.mockImplementation(async()=>{abort.abort();return question;});const events:TraceItem[]=[];
 await pipeline.run([regions[0]],settings,abort.signal,i=>events.push({...i}));expect(events.every(i=>i.status==='reading')).toBe(true);expect(buffers[0][0]).toBe(0);expect(providers.llm.answerTrace).not.toHaveBeenCalled();
});
it('streams complete fields across SSE chunks and uses the fast model override',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('TRACE_MODEL_FAST','fast-test');let request:any;
 const responseText=JSON.stringify({unclear:false,label:'C',answer:'',reason:''});
 const sse=[...responseText].map(char=>'data: '+JSON.stringify({choices:[{delta:{content:char}}]})+'\n\n').join('')+'data: [DONE]\n\n';
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{request=JSON.parse(init.body);return new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(sse);for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));}));
 const updates:any[]=[];const result=await new TraceLLM().answerTrace(question,parseMCQ(question),[],settings,'en',new AbortController().signal,p=>updates.push(p));
 expect(result.label).toBe('C');expect(updates.some(p=>p.label==='C')).toBe(true);expect(request.stream).toBe(true);expect(request.model).toBe('fast-test');expect(request.max_tokens).toBeLessThan(300);
});
it('rejects truncated model output instead of publishing it as final',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: '+JSON.stringify({choices:[{delta:{content:'{"unclear":false,"label":"C"'},finish_reason:'length'}]})+'\n\n')));
 await expect(new TraceLLM().answerTrace(question,parseMCQ(question),[],settings,'en',new AbortController().signal,()=>{})).rejects.toThrow('apiFailure');
});
