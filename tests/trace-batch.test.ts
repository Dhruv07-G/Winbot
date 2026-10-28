import {afterEach,expect,it,vi} from 'vitest';
import {defaults} from '../src/core/model';
import {parseMCQ} from '../src/core/trace';
import {TraceLLM} from '../src/providers/trace-llm';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const items=Array.from({length:6},(_,i)=>({id:i+1,question:'Q'+(i+1)+'. Which? A) One B) Two C) Three D) Four',mcq:parseMCQ('Which? A) One B) Two C) Three D) Four'),sources:[],language:'en'}));
const results=items.map(item=>({id:item.id,unclear:false,label:'C',answer:'',reason:''}));
const response=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({results})}}]}),{status:200,headers:{'Content-Type':'application/json'}});
it('answers six MCQs in one provider request and keeps their ids',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');
 const fetch=vi.fn(async(_url:string,_init:RequestInit)=>response());vi.stubGlobal('fetch',fetch);
 const answer=await new TraceLLM().answerBatch(items,defaults,new AbortController().signal);
 expect(fetch).toHaveBeenCalledTimes(1);
 const request=JSON.parse(String(fetch.mock.calls[0]![1].body));
 expect(request.stream).toBe(false);
 expect(JSON.parse(request.messages[1].content)).toHaveLength(6);
 expect(answer.map(item=>item.id)).toEqual([1,2,3,4,5,6]);
});
it('retries a transient 429 and reports a persistent limit distinctly',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');
 const limited=()=>new Response('',{status:429,headers:{'retry-after':'0.001'}});
 const fetch=vi.fn().mockImplementationOnce(async()=>limited()).mockImplementationOnce(async()=>response());
 vi.stubGlobal('fetch',fetch);
 await expect(new TraceLLM().answerBatch(items,defaults,new AbortController().signal)).resolves.toHaveLength(6);
 expect(fetch).toHaveBeenCalledTimes(2);
 const always=vi.fn(async()=>limited());vi.stubGlobal('fetch',always);
 await expect(new TraceLLM().answerBatch(items,defaults,new AbortController().signal)).rejects.toMatchObject({code:'apiRateLimit'});
 expect(always).toHaveBeenCalledTimes(3);
});
it('rejects missing ids and does not accept an invented option label',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');
 const invalid=new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({results:results.slice(1)})}}]}));
 vi.stubGlobal('fetch',vi.fn(async()=>invalid));
 await expect(new TraceLLM().answerBatch(items,defaults,new AbortController().signal)).rejects.toMatchObject({code:'apiFailure'});
 const invented=results.map(item=>({...item,label:'Z'}));
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({results:invented})}}]}))));
 const answer=await new TraceLLM().answerBatch(items,defaults,new AbortController().signal);
 expect(answer.every(item=>item.unclear)).toBe(true);
});
